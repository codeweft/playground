import CoreData

class PersistenceService: PersistenceServiceProtocol {
    private let context: NSManagedObjectContext

    init(context: NSManagedObjectContext = PersistenceController.shared.container.viewContext) {
        self.context = context
    }

    // MARK: - Survey CRUD
    func createSurvey(title: String) throws -> Survey {
        let newSurvey = Survey(context: context)
        newSurvey.id = UUID()
        newSurvey.title = title
        newSurvey.createdAt = Date()
        newSurvey.questions = NSOrderedSet() // Initialize questions
        try saveContext()
        return newSurvey
    }

    func fetchSurveys(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) throws -> [Survey] {
        let request: NSFetchRequest<Survey> = Survey.fetchRequest()
        
        var predicates: [NSPredicate] = []
        if let searchTerm = searchTerm, !searchTerm.isEmpty {
            predicates.append(NSPredicate(format: "title CONTAINS[c] %@", searchTerm))
        }
        // Add more predicates if needed, e.g., for filtering by creation date

        if !predicates.isEmpty {
            request.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        }

        if let sortDescriptor = sortDescriptor {
            request.sortDescriptors = [sortDescriptor]
        } else {
            // Default sort: newest first
            request.sortDescriptors = [NSSortDescriptor(keyPath: \Survey.createdAt, ascending: false)]
        }
        
        return try context.fetch(request)
    }

    func updateSurvey(survey: Survey, title: String?) throws {
        if let newTitle = title {
            survey.title = newTitle
        }
        // Add other updatable properties if necessary
        try saveContext()
    }

    func deleteSurvey(survey: Survey) throws {
        // Before deleting a survey, ensure related SurveyResponses are handled
        // to prevent orphaned data or referential integrity issues if not using cascade delete.
        // For example, delete related SurveyResponses or nullify their relationship to the survey.
        if let responses = survey.surveyResponses as? Set<SurveyResponse> {
            for response in responses {
                // Option 1: Delete related SurveyResponse
                 try deleteSurveyResponse(surveyResponse: response)
                // Option 2: Nullify relationship (if your model allows)
                // response.survey = nil
            }
        }
        context.delete(survey)
        try saveContext()
    }

    // MARK: - Question CRUD (within a Survey context)
    func addQuestionToSurvey(survey: Survey, text: String, type: QuestionType, options: [String]?, order: Int) throws -> Question {
        let newQuestion = Question(context: context)
        newQuestion.id = UUID()
        newQuestion.text = text
        newQuestion.type = type.rawValue
        newQuestion.order = Int16(order)

        if type == .multipleChoice || type == .singleChoice, let optionsArray = options, !optionsArray.isEmpty {
            do {
                let jsonData = try JSONEncoder().encode(optionsArray)
                newQuestion.options = String(data: jsonData, encoding: .utf8)
            } catch {
                // Handle JSON encoding error, perhaps rethrow a custom error
                throw error 
            }
        } else {
            newQuestion.options = nil
        }
        
        // Add to the ordered set
        let mutableQuestions = survey.questions?.mutableCopy() as? NSMutableOrderedSet ?? NSMutableOrderedSet()
        mutableQuestions.insert(newQuestion, at: order) // Or use add() if order doesn't need to be specific at insertion
        survey.questions = mutableQuestions.copy() as? NSOrderedSet

        newQuestion.survey = survey // Set the inverse relationship
        try saveContext()
        return newQuestion
    }

    func updateQuestionInSurvey(question: Question, text: String?, type: QuestionType?, options: [String]?, order: Int?) throws {
        if let newText = text {
            question.text = newText
        }
        if let newType = type {
            question.type = newType.rawValue
            if newType != .multipleChoice && newType != .singleChoice {
                question.options = nil // Clear options if not applicable
            }
        }
        if let newOrder = order {
            question.order = Int16(newOrder)
            // Re-ordering logic might be complex if you need to shift other questions.
            // For simplicity, this example just updates the order property.
            // A more robust solution might involve removing and reinserting the question or adjusting orders of siblings.
        }
        if let newOptions = options, (question.type == QuestionType.multipleChoice.rawValue || question.type == QuestionType.singleChoice.rawValue) {
            do {
                let jsonData = try JSONEncoder().encode(newOptions)
                question.options = String(data: jsonData, encoding: .utf8)
            } catch {
                throw error
            }
        } else if question.type != QuestionType.multipleChoice.rawValue && question.type != QuestionType.singleChoice.rawValue {
             question.options = nil // Ensure options are nil if not a choice question
        }

        try saveContext()
    }

    func deleteQuestionFromSurvey(survey: Survey, question: Question) throws {
        // Remove from the ordered set
        let mutableQuestions = survey.questions?.mutableCopy() as? NSMutableOrderedSet ?? NSMutableOrderedSet()
        mutableQuestions.remove(question)
        survey.questions = mutableQuestions.copy() as? NSOrderedSet
        
        context.delete(question) // This also removes it from the survey's questions set due to Core Data's relationship management
        try saveContext()
    }

    // MARK: - Participant CRUD
    func createParticipant(name: String, details: String?) throws -> Participant {
        let newParticipant = Participant(context: context)
        newParticipant.id = UUID()
        newParticipant.name = name
        newParticipant.details = details
        try saveContext()
        return newParticipant
    }

    func fetchParticipants(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) throws -> [Participant] {
        let request: NSFetchRequest<Participant> = Participant.fetchRequest()
        
        if let searchTerm = searchTerm, !searchTerm.isEmpty {
            request.predicate = NSPredicate(format: "name CONTAINS[c] %@", searchTerm)
        }

        if let sortDescriptor = sortDescriptor {
            request.sortDescriptors = [sortDescriptor]
        } else {
            request.sortDescriptors = [NSSortDescriptor(keyPath: \Participant.name, ascending: true)]
        }
        
        return try context.fetch(request)
    }

    func updateParticipant(participant: Participant, name: String?, details: String?) throws {
        if let newName = name {
            participant.name = newName
        }
        if let newDetails = details {
            participant.details = newDetails
        }
        try saveContext()
    }

    func deleteParticipant(participant: Participant) throws {
        // Similar to survey deletion, handle related SurveyResponses
        if let responses = participant.surveyResponses as? Set<SurveyResponse> {
            for response in responses {
                // Option 1: Delete related SurveyResponse
                try deleteSurveyResponse(surveyResponse: response)
                // Option 2: Nullify relationship (if your model allows)
                // response.participant = nil
            }
        }
        context.delete(participant)
        try saveContext()
    }

    // MARK: - SurveyResponse Operations
    func createSurveyResponse(survey: Survey, participant: Participant, interviewDate: Date) throws -> SurveyResponse {
        let newResponse = SurveyResponse(context: context)
        newResponse.id = UUID()
        newResponse.survey = survey
        newResponse.participant = participant
        newResponse.interviewDate = interviewDate
        newResponse.individualResponses = NSSet() // Initialize
        try saveContext()
        return newResponse
    }

    func fetchSurveyResponses(for survey: Survey, participant: Participant? = nil) throws -> [SurveyResponse] {
        let request: NSFetchRequest<SurveyResponse> = SurveyResponse.fetchRequest()
        var predicates: [NSPredicate] = [NSPredicate(format: "survey == %@", survey)]
        
        if let participant = participant {
            predicates.append(NSPredicate(format: "participant == %@", participant))
        }
        
        request.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
        request.sortDescriptors = [NSSortDescriptor(keyPath: \SurveyResponse.interviewDate, ascending: false)]
        
        return try context.fetch(request)
    }

    func deleteSurveyResponse(surveyResponse: SurveyResponse) throws {
        // Delete related IndividualResponses first
        if let individualResponses = surveyResponse.individualResponses as? Set<IndividualResponse> {
            for ir in individualResponses {
                try deleteIndividualResponse(individualResponse: ir)
            }
        }
        context.delete(surveyResponse)
        try saveContext()
    }
    
    // MARK: - IndividualResponse Operations
    func addIndividualResponse(to surveyResponse: SurveyResponse, question: Question, responseText: String) throws -> IndividualResponse {
        let newIndividualResponse = IndividualResponse(context: context)
        newIndividualResponse.id = UUID()
        newIndividualResponse.questionText = question.text // Store denormalized text for easier display
        newIndividualResponse.responseText = responseText
        newIndividualResponse.questionType = question.type // Store denormalized type
        
        // Add to the set
        let mutableResponses = surveyResponse.individualResponses?.mutableCopy() as? NSMutableSet ?? NSMutableSet()
        mutableResponses.add(newIndividualResponse)
        surveyResponse.individualResponses = mutableResponses.copy() as? NSSet
        
        newIndividualResponse.surveyResponse = surveyResponse // Set inverse relationship

        try saveContext()
        return newIndividualResponse
    }

    func updateIndividualResponse(individualResponse: IndividualResponse, responseText: String?) throws {
        if let newResponseText = responseText {
            individualResponse.responseText = newResponseText
        }
        try saveContext()
    }

    func deleteIndividualResponse(individualResponse: IndividualResponse) throws {
        context.delete(individualResponse)
        // No need to explicitly remove from SurveyResponse.individualResponses if using Core Data's default delete rules (cascade or nullify)
        // However, if SurveyResponse.individualResponses is not optional or a different rule is set, manual removal might be needed before deleting.
        try saveContext()
    }

    // MARK: - General
    func saveContext() throws {
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                // Rethrow the Core Data save error
                throw error
            }
        }
    }
}
