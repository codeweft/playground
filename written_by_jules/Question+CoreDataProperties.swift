import Foundation
import CoreData

extension Question {

    @nonobjc public class func fetchRequest() -> NSFetchRequest<Question> {
        return NSFetchRequest<Question>(entityName: "Question")
    }

    @NSManaged public var id: UUID?
    @NSManaged public var text: String?
    @NSManaged public var type: String?
    @NSManaged public var options: String?
    @NSManaged public var order: Int16
    @NSManaged public var survey: Survey?

}

extension Question : Identifiable {

}
