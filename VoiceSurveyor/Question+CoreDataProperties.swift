import Foundation
import CoreData

public extension Question {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<Question> {
        return NSFetchRequest<Question>(entityName: "Question")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var text: String?
    @NSManaged public var type: String? // Corresponds to QuestionType.rawValue
    @NSManaged public var options: String? // JSON string for options
    @NSManaged public var order: Int16
    @NSManaged public var survey: Survey?

}
