import Foundation
import CoreData

public extension IndividualResponse {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<IndividualResponse> {
        return NSFetchRequest<IndividualResponse>(entityName: "IndividualResponse")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var questionText: String? // Denormalized
    @NSManaged public var responseText: String?
    @NSManaged public var questionType: String? // Denormalized
    @NSManaged public var surveyResponse: SurveyResponse?

}
