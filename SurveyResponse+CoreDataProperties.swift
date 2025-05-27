import Foundation
import CoreData

extension SurveyResponse {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<SurveyResponse> {
        return NSFetchRequest<SurveyResponse>(entityName: "SurveyResponse")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var interviewDate: Date?
    @NSManaged public var participant: Participant?
    @NSManaged public var survey: Survey?
    @NSManaged public var individualResponses: NSSet?

}

// MARK: Generated accessors for individualResponses
extension SurveyResponse {

    @objc(addIndividualResponsesObject:)
    @NSManaged public func addToIndividualResponses(_ value: IndividualResponse)

    @objc(removeIndividualResponsesObject:)
    @NSManaged public func removeFromIndividualResponses(_ value: IndividualResponse)

    @objc(addIndividualResponses:)
    @NSManaged public func addToIndividualResponses(_ values: NSSet)

    @objc(removeIndividualResponses:)
    @NSManaged public func removeFromIndividualResponses(_ values: NSSet)

}

extension SurveyResponse : Identifiable {

}
