import CoreData

class PersistenceService: PersistenceServiceProtocol {
    private let context: NSManagedObjectContext

    init(context: NSManagedObjectContext = PersistenceController.shared.container.viewContext) {
        self.context = context
    }

    // MARK: - Survey CRUD
    func createSurvey(title: String) async throws -> Survey {
        return try await context.perform {
            let newSurvey = Survey(context: self.context)
            newSurvey.id = UUID()
            newSurvey.title = title
            newSurvey.createdAt = Date()
            newSurvey.questions = NSOrderedSet() // Initialize questions
            if self.context.hasChanges {
                try self.context.save()
            }
            return newSurvey
        }
    }

    func fetchSurveys(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) async throws -> [Survey] {
        return try await context.perform {
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
            
            return try self.context.fetch(request)
        }
    }

    func updateSurvey(survey: Survey, title: String?) async throws {
        try await context.perform {
            if let newTitle = title {
                survey.title = newTitle
            }
            // Add other updatable properties if necessary
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    func deleteSurvey(survey: Survey) async throws {
        try await context.perform {
            self.context.delete(survey)
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    // MARK: - Question CRUD (within a Survey context)
    func addQuestionToSurvey(survey: Survey, text: String, type: QuestionType, options: [String]?, order: Int) async throws -> Question {
        return try await context.perform {
            let newQuestion = Question(context: self.context)
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
            if self.context.hasChanges {
                try self.context.save()
            }
            return newQuestion
        }
    }

    func updateQuestionInSurvey(question: Question, text: String?, type: QuestionType?, options: [String]?, order: Int?) async throws {
        try await context.perform {
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

            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    func deleteQuestionFromSurvey(survey: Survey, question: Question) async throws {
        try await context.perform {
            // Remove from the ordered set
            let mutableQuestions = survey.questions?.mutableCopy() as? NSMutableOrderedSet ?? NSMutableOrderedSet()
            mutableQuestions.remove(question)
            survey.questions = mutableQuestions.copy() as? NSOrderedSet
            
            self.context.delete(question) // This also removes it from the survey's questions set due to Core Data's relationship management
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    func fetchQuestion(with objectID: NSManagedObjectID) async throws -> Question? {
        return try await context.perform {
            // Attempt to fetch the object. It might throw if the objectID is temporary,
            // or if the object doesn't exist (though existingObject(with:) usually faults it in).
            // Consider if a simple fetch or existingObject is better. existingObject is fine if ID is permanent.
            guard let object = try? self.context.existingObject(with: objectID) else {
                return nil // Object not found or ID invalid in this context
            }
            return object as? Question
        }
    }

    // MARK: - Participant CRUD
    func createParticipant(name: String, details: String?) async throws -> Participant {
        return try await context.perform {
            let newParticipant = Participant(context: self.context)
            newParticipant.id = UUID()
            newParticipant.name = name
            newParticipant.details = details
            if self.context.hasChanges {
                try self.context.save()
            }
            return newParticipant
        }
    }

    func fetchParticipants(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) async throws -> [Participant] {
        return try await context.perform {
            let request: NSFetchRequest<Participant> = Participant.fetchRequest()
            
            if let searchTerm = searchTerm, !searchTerm.isEmpty {
                request.predicate = NSPredicate(format: "name CONTAINS[c] %@", searchTerm)
            }

            if let sortDescriptor = sortDescriptor {
                request.sortDescriptors = [sortDescriptor]
            } else {
                request.sortDescriptors = [NSSortDescriptor(keyPath: \Participant.name, ascending: true)]
            }
            
            return try self.context.fetch(request)
        }
    }

    func updateParticipant(participant: Participant, name: String?, details: String?) async throws {
        try await context.perform {
            if let newName = name {
                participant.name = newName
            }
            if let newDetails = details {
                participant.details = newDetails
            }
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    func deleteParticipant(participant: Participant) async throws {
        try await context.perform {
            self.context.delete(participant)
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    // MARK: - SurveyResponse Operations
    func createSurveyResponse(survey: Survey, participant: Participant, interviewDate: Date) async throws -> SurveyResponse {
        return try await context.perform {
            let newResponse = SurveyResponse(context: self.context)
            newResponse.id = UUID()
            newResponse.survey = survey
            newResponse.participant = participant
            newResponse.interviewDate = interviewDate
            newResponse.individualResponses = NSSet() // Initialize
            if self.context.hasChanges {
                try self.context.save()
            }
            return newResponse
        }
    }

    func fetchSurveyResponses(for survey: Survey, participant: Participant? = nil) async throws -> [SurveyResponse] {
        return try await context.perform {
            let request: NSFetchRequest<SurveyResponse> = SurveyResponse.fetchRequest()
            var predicates: [NSPredicate] = [NSPredicate(format: "survey == %@", survey)]
            
            if let participant = participant {
                predicates.append(NSPredicate(format: "participant == %@", participant))
            }
            
            request.predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)
            request.sortDescriptors = [NSSortDescriptor(keyPath: \SurveyResponse.interviewDate, ascending: false)]
            
            return try self.context.fetch(request)
        }
    }

    func deleteSurveyResponse(surveyResponse: SurveyResponse) async throws {
        try await context.perform {
            self.context.delete(surveyResponse)
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }
    
    // MARK: - IndividualResponse Operations
    func addIndividualResponse(to surveyResponse: SurveyResponse, question: Question, responseText: String) async throws -> IndividualResponse {
        return try await context.perform {
            let newIndividualResponse = IndividualResponse(context: self.context)
            newIndividualResponse.id = UUID()
            newIndividualResponse.questionText = question.text // Store denormalized text for easier display
            newIndividualResponse.responseText = responseText
            newIndividualResponse.questionType = question.type // Store denormalized type
            
            // Add to the set
            let mutableResponses = surveyResponse.individualResponses?.mutableCopy() as? NSMutableSet ?? NSMutableSet()
            mutableResponses.add(newIndividualResponse)
            surveyResponse.individualResponses = mutableResponses.copy() as? NSSet
            
            newIndividualResponse.surveyResponse = surveyResponse // Set inverse relationship

            if self.context.hasChanges {
                try self.context.save()
            }
            return newIndividualResponse
        }
    }

    func updateIndividualResponse(individualResponse: IndividualResponse, responseText: String?) async throws {
        try await context.perform {
            if let newResponseText = responseText {
                individualResponse.responseText = newResponseText
            }
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    func deleteIndividualResponse(individualResponse: IndividualResponse) async throws {
        try await context.perform {
            self.context.delete(individualResponse)
            // No need to explicitly remove from SurveyResponse.individualResponses if using Core Data's default delete rules (cascade or nullify)
            // However, if SurveyResponse.individualResponses is not optional or a different rule is set, manual removal might be needed before deleting.
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }

    // MARK: - General
    func saveContext() async throws {
        try await context.perform {
            if self.context.hasChanges {
                try self.context.save()
            }
        }
    }
}
