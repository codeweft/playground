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
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
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
                fatalError("Unresolved error \(error), \(error.userInfo)")
            }
        })
        container.viewContext.automaticallyMergesChangesFromParent = true
    }

    func saveContext() {
        let context = container.viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                let nserror = error as NSError
                fatalError("Unresolved error \(nserror), \(nserror.userInfo)")
            }
        }
    }
}
