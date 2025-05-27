import Foundation
import CoreData

extension Survey {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<Survey> {
        return NSFetchRequest<Survey>(entityName: "Survey")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var title: String?
    @NSManaged public var createdAt: Date?
    @NSManaged public var questions: NSOrderedSet?
    @NSManaged public var surveyResponses: NSSet?

}

// MARK: Generated accessors for questions
extension Survey {

    @objc(insertObject:inQuestionsAtIndex:)
    @NSManaged public func insertIntoQuestions(_ value: Question, at idx: Int)

    @objc(removeObjectFromQuestionsAtIndex:)
    @NSManaged public func removeFromQuestions(at idx: Int)

    @objc(insertQuestions:atIndexes:)
    @NSManaged public func insertIntoQuestions(_ values: [Question], at indexes: NSIndexSet)

    @objc(removeQuestionsAtIndexes:)
    @NSManaged public func removeFromQuestions(at indexes: NSIndexSet)

    @objc(replaceObjectInQuestionsAtIndex:withObject:)
    @NSManaged public func replaceQuestions(at idx: Int, with value: Question)

    @objc(replaceQuestionsAtIndexes:withQuestions:)
    @NSManaged public func replaceQuestions(at indexes: NSIndexSet, with values: [Question])

    @objc(addQuestionsObject:)
    @NSManaged public func addToQuestions(_ value: Question)

    @objc(removeQuestionsObject:)
    @NSManaged public func removeFromQuestions(_ value: Question)

    @objc(addQuestions:)
    @NSManaged public func addToQuestions(_ values: NSOrderedSet)

    @objc(removeQuestions:)
    @NSManaged public func removeFromQuestions(_ values: NSOrderedSet)

}

// MARK: Generated accessors for surveyResponses
extension Survey {

    @objc(addSurveyResponsesObject:)
    @NSManaged public func addToSurveyResponses(_ value: SurveyResponse)

    @objc(removeSurveyResponsesObject:)
    @NSManaged public func removeFromSurveyResponses(_ value: SurveyResponse)

    @objc(addSurveyResponses:)
    @NSManaged public func addToSurveyResponses(_ values: NSSet)

    @objc(removeSurveyResponses:)
    @NSManaged public func removeFromSurveyResponses(_ values: NSSet)

}

extension Survey : Identifiable {

}
