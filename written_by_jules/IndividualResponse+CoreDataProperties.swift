import Foundation
import CoreData

extension IndividualResponse {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<IndividualResponse> {
        return NSFetchRequest<IndividualResponse>(entityName: "IndividualResponse")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var questionText: String?
    @NSManaged public var responseText: String?
    @NSManaged public var questionType: String?
    @NSManaged public var surveyResponse: SurveyResponse?

}

extension IndividualResponse : Identifiable {

}
