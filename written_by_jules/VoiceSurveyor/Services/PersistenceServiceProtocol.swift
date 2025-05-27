import CoreData

enum QuestionType: String, CaseIterable, Codable {
    case multipleChoice = "Multiple Choice"
    case singleChoice = "Single Choice"
    case openEnded = "Open Ended"
}

protocol PersistenceServiceProtocol {
    // MARK: - Survey CRUD
    func createSurvey(title: String) throws -> Survey
    func fetchSurveys(searchTerm: String?, sortDescriptor: NSSortDescriptor?) throws -> [Survey]
    func updateSurvey(survey: Survey, title: String?) throws
    func deleteSurvey(survey: Survey) throws

    // MARK: - Question CRUD (within a Survey context)
    func addQuestionToSurvey(survey: Survey, text: String, type: QuestionType, options: [String]?, order: Int) throws -> Question
    func updateQuestionInSurvey(question: Question, text: String?, type: QuestionType?, options: [String]?, order: Int?) throws
    func deleteQuestionFromSurvey(survey: Survey, question: Question) throws

    // MARK: - Participant CRUD
    func createParticipant(name: String, details: String?) throws -> Participant
    func fetchParticipants(searchTerm: String?, sortDescriptor: NSSortDescriptor?) throws -> [Participant]
    func updateParticipant(participant: Participant, name: String?, details: String?) throws
    func deleteParticipant(participant: Participant) throws

    // MARK: - SurveyResponse Operations
    func createSurveyResponse(survey: Survey, participant: Participant, interviewDate: Date) throws -> SurveyResponse
    func fetchSurveyResponses(for survey: Survey, participant: Participant?) throws -> [SurveyResponse]
    func deleteSurveyResponse(surveyResponse: SurveyResponse) throws
    
    // MARK: - IndividualResponse Operations
    func addIndividualResponse(to surveyResponse: SurveyResponse, question: Question, responseText: String) throws -> IndividualResponse
    func updateIndividualResponse(individualResponse: IndividualResponse, responseText: String?) throws
    func deleteIndividualResponse(individualResponse: IndividualResponse) throws
    
    // MARK: - General
    func saveContext() throws
}
