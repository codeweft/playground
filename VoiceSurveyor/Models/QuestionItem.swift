import Foundation
import CoreData

struct QuestionItem: Identifiable, Hashable {
    let id: UUID // Use UUID for identifiable conformance, can be Question's ID or new for unsaved.
    var coreDataId: NSManagedObjectID? // To track existing Question objects
    var text: String
    var type: QuestionType
    var options: [String]
    var order: Int

    // Initializer for a new question (not yet saved to Core Data)
    init(id: UUID = UUID(), text: String = "", type: QuestionType = .openEnded, options: [String] = [], order: Int = 0) {
        self.id = id
        self.coreDataId = nil
        self.text = text
        self.type = type
        self.options = options
        self.order = order
    }

    // Initializer from an existing Question Core Data object
    init(question: Question) {
        self.id = question.id ?? UUID() // Should always have an ID from Core Data
        self.coreDataId = question.objectID
        self.text = question.text ?? ""
        self.type = QuestionType(rawValue: question.type ?? "") ?? .openEnded
        self.order = Int(question.order)

        if let optionsString = question.options,
           let data = optionsString.data(using: .utf8) {
            do {
                self.options = try JSONDecoder().decode([String].self, from: data)
            } catch {
                self.options = []
                // Consider logging this error or handling it more gracefully
                AppLogger.error("Error decoding options for question ID \(self.id): \(error.localizedDescription)")
            }
        } else {
            self.options = []
        }
    }

    // Helper to convert options array to JSON string for saving to Core Data
    func optionsJSONString() -> String? {
        guard !options.isEmpty, type == .multipleChoice || type == .singleChoice else {
            return nil
        }
        do {
            let data = try JSONEncoder().encode(options)
            return String(data: data, encoding: .utf8)
        } catch {
            // Consider logging this error
            AppLogger.error("Error encoding options for question ID \(self.id): \(error.localizedDescription)")
            return nil
        }
    }

    // Hashable conformance
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: QuestionItem, rhs: QuestionItem) -> Bool {
        lhs.id == rhs.id
    }
}
