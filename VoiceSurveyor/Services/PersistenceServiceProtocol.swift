import CoreData

enum QuestionType: String, CaseIterable, Codable {
    case multipleChoice = "Multiple Choice"
    case singleChoice = "Single Choice"
    case openEnded = "Open Ended"

    var localizedDescription: String {
        // TODO: Replace self.rawValue with NSLocalizedString for actual localization.
        // For example: return NSLocalizedString(self.rawValue, comment: "Question type display name")
        return self.rawValue
    }
}

protocol PersistenceServiceProtocol {
    // MARK: - Survey CRUD
    func createSurvey(title: String) async throws -> Survey
    func fetchSurveys(searchTerm: String?, sortDescriptor: NSSortDescriptor?) async throws -> [Survey]
    func updateSurvey(survey: Survey, title: String?) async throws
    func deleteSurvey(survey: Survey) async throws

    // MARK: - Question CRUD (within a Survey context)
    func addQuestionToSurvey(survey: Survey, text: String, type: QuestionType, options: [String]?, order: Int) async throws -> Question
    func updateQuestionInSurvey(question: Question, text: String?, type: QuestionType?, options: [String]?, order: Int?) async throws
    func deleteQuestionFromSurvey(survey: Survey, question: Question) async throws
    func fetchQuestion(with objectID: NSManagedObjectID) async throws -> Question?

    // MARK: - Participant CRUD
    func createParticipant(name: String, details: String?) async throws -> Participant
    func fetchParticipants(searchTerm: String?, sortDescriptor: NSSortDescriptor?) async throws -> [Participant]
    func updateParticipant(participant: Participant, name: String?, details: String?) async throws
    func deleteParticipant(participant: Participant) async throws

    // MARK: - SurveyResponse Operations
    func createSurveyResponse(survey: Survey, participant: Participant, interviewDate: Date) async throws -> SurveyResponse
    func fetchSurveyResponses(for survey: Survey, participant: Participant?) async throws -> [SurveyResponse]
    func deleteSurveyResponse(surveyResponse: SurveyResponse) async throws
    
    // MARK: - IndividualResponse Operations
    func addIndividualResponse(to surveyResponse: SurveyResponse, question: Question, responseText: String) async throws -> IndividualResponse
    func updateIndividualResponse(individualResponse: IndividualResponse, responseText: String?) async throws
    func deleteIndividualResponse(individualResponse: IndividualResponse) async throws
    
    // MARK: - General
    func saveContext() async throws
}
