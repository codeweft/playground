import Foundation
import CoreData
import Combine // For ObservableObject

// Define QuestionType enum globally or within a relevant scope
enum QuestionType: String, CaseIterable, Identifiable {
    case openEnded = "Open-Ended"
    case multipleChoice = "Multiple Choice"
    var id: String { self.rawValue }
}

class QuestionViewModel: ObservableObject {
    private var questionToEdit: Question?
    
    @Published var questionText: String = ""
    @Published var questionType: QuestionType = .openEnded
    @Published var optionsString: String = "" // Comma-separated for multiple choice
    @Published var order: Int16
    
    private let survey: Survey
    private let moc: NSManagedObjectContext

    init(moc: NSManagedObjectContext, survey: Survey, question: Question? = nil, order: Int16) {
        self.moc = moc
        self.survey = survey
        self.questionToEdit = question
        self.order = order

        if let question = question {
            self.questionText = question.text ?? ""
            self.optionsString = question.options ?? ""
            self.order = question.order // Use existing order if editing

            // Convert stored String type to QuestionType enum
            if let type = QuestionType(rawValue: question.questionType ?? "") {
                self.questionType = type
            } else {
                self.questionType = .openEnded // Default if conversion fails
            }
        }
    }

    func saveQuestion() {
        let questionToSave: Question
        if let existingQuestion = questionToEdit {
            questionToSave = existingQuestion
        } else {
            questionToSave = Question(context: moc)
            questionToSave.id = UUID() // Set ID for new questions
            questionToSave.survey = self.survey // Assign to the survey
        }

        questionToSave.text = questionText
        questionToSave.questionType = questionType.rawValue
        questionToSave.order = order
        
        if questionType == .multipleChoice {
            questionToSave.options = optionsString
        } else {
            questionToSave.options = nil // Clear options if not multiple choice
        }

        do {
            try moc.save()
        } catch {
            print("Error saving question: \(error.localizedDescription)")
            // Implement more robust error handling in a production app
        }
    }

    func deleteQuestion() {
        guard let questionToDelete = questionToEdit else { return }
        moc.delete(questionToDelete)
        do {
            try moc.save()
        } catch {
            print("Error deleting question: \(error.localizedDescription)")
            // Handle error
        }
    }
}
