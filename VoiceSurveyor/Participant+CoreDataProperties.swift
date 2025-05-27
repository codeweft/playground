import Foundation
import CoreData

public extension Participant {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<Participant> {
        return NSFetchRequest<Participant>(entityName: "Participant")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var name: String?
    @NSManaged public var details: String?
    @NSManaged public var surveyResponses: NSSet?

}

// MARK: Generated accessors for surveyResponses
extension Participant {

    @objc(addSurveyResponsesObject:)
    @NSManaged public func addToSurveyResponses(_ value: SurveyResponse)

    @objc(removeSurveyResponsesObject:)
    @NSManaged public func removeFromSurveyResponses(_ value: SurveyResponse)

    @objc(addSurveyResponses:)
    @NSManaged public func addToSurveyResponses(_ values: NSSet)

    @objc(removeSurveyResponses:)
    @NSManaged public func removeFromSurveyResponses(_ values: NSSet)

}
