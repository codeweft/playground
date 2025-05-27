import CoreData

struct PersistenceController {
    static let shared = PersistenceController()

    static var preview: PersistenceController = {
        let result = PersistenceController(inMemory: true)
        let viewContext = result.container.viewContext
        // Create sample data for preview
        let newSurvey = Survey(context: viewContext)
        newSurvey.id = UUID()
        newSurvey.title = "Sample Survey"
        newSurvey.createdAt = Date()

        let question1 = Question(context: viewContext)
        question1.id = UUID()
        question1.text = "What is your favorite color?"
        question1.type = "Multiple Choice"
        question1.options = "Red,Green,Blue"
        question1.order = 0
        question1.survey = newSurvey

        let question2 = Question(context: viewContext)
        question2.id = UUID()
        question2.text = "How often do you exercise?"
        question2.type = "Single Choice"
        question2.options = "Daily,Weekly,Monthly,Rarely"
        question2.order = 1
        question2.survey = newSurvey
        
        newSurvey.addToQuestions(question1)
        newSurvey.addToQuestions(question2)

        let participant = Participant(context: viewContext)
        participant.id = UUID()
        participant.name = "John Doe"
        participant.details = "Sample participant"

        let surveyResponse = SurveyResponse(context: viewContext)
        surveyResponse.id = UUID()
        surveyResponse.interviewDate = Date()
        surveyResponse.participant = participant
        surveyResponse.survey = newSurvey

        let individualResponse1 = IndividualResponse(context: viewContext)
        individualResponse1.id = UUID()
        individualResponse1.questionText = question1.text
        individualResponse1.responseText = "Blue"
        individualResponse1.questionType = question1.type
        individualResponse1.surveyResponse = surveyResponse
        
        let individualResponse2 = IndividualResponse(context: viewContext)
        individualResponse2.id = UUID()
        individualResponse2.questionText = question2.text
        individualResponse2.responseText = "Weekly"
        individualResponse2.questionType = question2.type
        individualResponse2.surveyResponse = surveyResponse

        surveyResponse.addToIndividualResponses(individualResponse1)
        surveyResponse.addToIndividualResponses(individualResponse2)
        
        do {
            try viewContext.save()
        } catch {
            let nsError = error as NSError
            AppLogger.error("Failed to save preview context: \(nsError.localizedDescription), userInfo: \(nsError.userInfo)", tag: "PersistenceController")
            // Depending on how critical previews are, one might still choose to fatalError for dev experience.
            // For this task, we're removing fatalError.
        }
        return result
    }()

    let container: NSPersistentContainer

    init(inMemory: Bool = false) {
        container = NSPersistentContainer(name: "VoiceSurveyor")
        if inMemory {
            container.persistentStoreDescriptions.first!.url = URL(fileURLWithPath: "/dev/null")
        }
        container.loadPersistentStores(completionHandler: { (storeDescription, error) in
            if let error = error as NSError? {
                AppLogger.critical("Failed to load persistent store: \(error.localizedDescription), userInfo: \(error.userInfo)", tag: "PersistenceController")
                // In a real app, you might set a global error state here to inform the UI.
                // For example: AppErrorManager.shared.reportFatalError(error)
            }
        })
        container.viewContext.automaticallyMergesChangesFromParent = true
    }

    func saveContext() async throws {
        let context = container.viewContext
        try await context.perform { // Ensure operations are on the context's queue
            if context.hasChanges {
                do {
                    try context.save()
                } catch {
                    AppLogger.error("Failed to save context: \(error.localizedDescription), userInfo: \((error as NSError).userInfo)", tag: "PersistenceController")
                    throw error // Rethrow the error for the caller to handle
                }
            }
        }
    }
}
