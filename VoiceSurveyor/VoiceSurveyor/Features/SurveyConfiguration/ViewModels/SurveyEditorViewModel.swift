import Foundation
import Combine
import CoreData // For NSManagedObjectID and potentially Survey/Question types

class SurveyEditorViewModel: ObservableObject {
    @Published var surveyTitle: String = ""
    @Published var questions: [QuestionItem] = []
    @Published var isNewSurvey: Bool = true
    
    private var persistenceService: PersistenceServiceProtocol
    private var survey: Survey? // Holds the survey being edited, nil if new
    private var originalQuestionIdsToDelete: Set<NSManagedObjectID> = [] // Tracks questions to delete

    // Initializer for a new survey
    init(persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        self.isNewSurvey = true
        self.survey = nil
        // Can add a default first question if desired
        // addQuestion() 
    }

    // Initializer for editing an existing survey
    init(survey: Survey, persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        self.survey = survey
        self.isNewSurvey = false
        self.surveyTitle = survey.title ?? ""
        
        if let existingQuestions = survey.questions as? NSOrderedSet {
            self.questions = existingQuestions.array.compactMap { $0 as? Question }.map { QuestionItem(question: $0) }
        } else {
            self.questions = []
        }
        reorderQuestions() // Ensure initial order is correct
    }

    func addQuestion() {
        let newOrder = questions.count
        let newQuestionItem = QuestionItem(order: newOrder)
        questions.append(newQuestionItem)
        // No reorder needed here as it's appended to the end with correct order
    }

    func deleteQuestion(at offsets: IndexSet) {
        for index in offsets {
            let questionToDelete = questions[index]
            if let coreDataId = questionToDelete.coreDataId {
                originalQuestionIdsToDelete.insert(coreDataId)
            }
        }
        questions.remove(atOffsets: offsets)
        reorderQuestions()
    }
    
    func deleteQuestion(_ questionItem: QuestionItem) {
        if let index = questions.firstIndex(where: { $0.id == questionItem.id }) {
            if let coreDataId = questions[index].coreDataId {
                originalQuestionIdsToDelete.insert(coreDataId)
            }
            questions.remove(at: index)
            reorderQuestions()
        }
    }

    func moveQuestion(from source: IndexSet, to destination: Int) {
        questions.move(fromOffsets: source, toOffset: destination)
        reorderQuestions()
    }

    private func reorderQuestions() {
        for i in 0..<questions.count {
            questions[i].order = i
        }
    }

    func saveSurvey() {
        do {
            let currentSurvey: Survey
            if let existingSurvey = self.survey {
                currentSurvey = existingSurvey
                // Update existing survey title if changed
                if currentSurvey.title != surveyTitle {
                    try persistenceService.updateSurvey(survey: currentSurvey, title: surveyTitle)
                }
            } else {
                // Create new survey
                currentSurvey = try persistenceService.createSurvey(title: surveyTitle)
                self.survey = currentSurvey // Keep reference to the now existing survey
                self.isNewSurvey = false // It's no longer a new survey
            }

            // Process questions: update existing, add new, delete removed
            var existingQuestionCoreDataObjects = currentSurvey.questions?.array.compactMap { $0 as? Question } ?? []

            for i in 0..<questions.count {
                questions[i].order = i // ✅ Safe mutation
                let questionItem = questions[i]
                if let coreDataId = questionItem.coreDataId,
                   let existingQuestion = existingQuestionCoreDataObjects.first(where: { $0.objectID == coreDataId }) {
                    // Update existing question
                    try persistenceService.updateQuestionInSurvey(
                        question: existingQuestion,
                        text: questionItem.text,
                        type: questionItem.type,
                        options: questionItem.options,
                        order: questionItem.order
                    )
                    // Remove from list so we know it's been processed
                    existingQuestionCoreDataObjects.removeAll(where: {$0.objectID == coreDataId })
                } else {
                    // Add new question
                    _ = try persistenceService.addQuestionToSurvey(
                        survey: currentSurvey,
                        text: questionItem.text,
                        type: questionItem.type,
                        options: questionItem.options,
                        order: questionItem.order
                    )
                }
            }
            
            // Questions that were in `existingQuestionCoreDataObjects` but not in `questionItem.coreDataId`
            // should have been caught by `originalQuestionIdsToDelete` if they were explicitly deleted.
            // However, if `originalQuestionIdsToDelete` is the sole mechanism for deletion,
            // we need to ensure it's populated correctly if a question is removed from the `questions` array
            // without explicitly calling `deleteQuestion`. This is handled by `originalQuestionIdsToDelete`.

            for questionObjectIDToDelete in originalQuestionIdsToDelete {
                 if let questionToDelete = try? persistenceService.context.existingObject(with: questionObjectIDToDelete) as? Question {
                    try persistenceService.deleteQuestionFromSurvey(survey: currentSurvey, question: questionToDelete)
                 }
            }
            originalQuestionIdsToDelete.removeAll() // Clear after processing

            try persistenceService.saveContext() // Commit all changes

        } catch {
            print("Error saving survey: \(error)")
            // Handle error appropriately (e.g., show alert to user)
        }
    }
}

// Extension to allow PersistenceService to access the context if needed for fetching objects by ID
extension PersistenceServiceProtocol {
    var context: NSManagedObjectContext {
        if let service = self as? PersistenceService {
            return service.context // Assuming PersistenceService has a public context
        }
        // Fallback or error if the context cannot be accessed.
        // This might indicate a need to refactor how context is accessed or passed.
        // For this example, we'll assume direct access or a specific method is available.
        // A better approach might be to add a method to the protocol like `fetchQuestion(by objectID: NSManagedObjectID)`.
        fatalError("Context could not be accessed from PersistenceServiceProtocol directly. Implement access or specific fetch methods.")
    }
}

// Temporary extension on PersistenceService to expose context (if not already public)
// This is illustrative. In a real app, ensure context access is designed carefully.
fileprivate extension PersistenceService {
    var context: NSManagedObjectContext {
        // Assuming `PersistenceService` has a property `context: NSManagedObjectContext`
        // This is a simplified example. If context is private, you'd need a method in PersistenceService
        // to fetch an object by its ID, or make context accessible in a controlled way.
        // For the purpose of this example, we'll assume it's accessible for `existingObject(with:)`.
        
        // If your PersistenceService is initialized with `PersistenceController.shared.container.viewContext`,
        // you can use that.
        return PersistenceController.shared.container.viewContext
    }
}
