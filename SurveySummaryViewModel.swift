import Foundation
import CoreData
import Combine // For ObservableObject

// Struct for response data, identifiable for SwiftUI Lists
struct ResponseData: Identifiable {
    let id: UUID // Response ID
    let questionText: String
    let responseText: String
    let questionOrder: Int16
}

class SurveySummaryViewModel: ObservableObject {
    // MARK: - Properties
    let survey: Survey
    let participant: Participant
    let moc: NSManagedObjectContext

    @Published var responses: [ResponseData] = []
    @Published var surveyTitle: String = ""
    @Published var participantName: String = ""

    // MARK: - Initializer
    init(moc: NSManagedObjectContext, survey: Survey, participant: Participant) {
        self.moc = moc
        self.survey = survey
        self.participant = participant

        self.surveyTitle = survey.title ?? "N/A"
        self.participantName = participant.name ?? "Anonymous Participant"
        
        fetchResponses()
    }

    // MARK: - Data Fetching
    func fetchResponses() {
        let request: NSFetchRequest<Response> = Response.fetchRequest()
        // Predicate to filter responses for the specific survey and participant
        request.predicate = NSPredicate(format: "survey == %@ AND participant == %@", survey, participant)
        
        // Sort descriptor to order responses by question order
        // Ensure 'question.order' is a valid key path.
        // If 'question' is nil, this sort might be problematic, so ensure data integrity.
        let sortDescriptor = NSSortDescriptor(keyPath: \Response.question?.order, ascending: true)
        request.sortDescriptors = [sortDescriptor]

        do {
            let fetchedResponses = try moc.fetch(request)
            self.responses = fetchedResponses.map { response in
                ResponseData(
                    id: response.id ?? UUID(), // Fallback to new UUID if response.id is nil
                    questionText: response.question?.text ?? "Question text not found",
                    responseText: response.responseText ?? "No response",
                    questionOrder: response.question?.order ?? Int16.max // Place unordered questions last
                )
            }
            // Additional sort in memory in case Core Data sort on key path is not sufficient or for nil safety
            self.responses.sort { $0.questionOrder < $1.questionOrder }
            
        } catch {
            print("Error fetching responses: \(error.localizedDescription)")
            // Handle error appropriately, e.g., by setting an error message property
        }
    }

    // MARK: - CSV Generation
    private func escapeCSV(_ field: String) -> String {
        var escapedField = field
        // Replace quotes with double quotes
        escapedField = escapedField.replacingOccurrences(of: "\"", with: "\"\"")
        // If the field contains a comma, newline, or quote, wrap it in quotes
        if escapedField.contains(",") || escapedField.contains("\n") || field.contains("\"") {
            escapedField = "\"\(escapedField)\""
        }
        return escapedField
    }

    func generateCSV() -> String {
        var csvString = "Question Number,Question Text,Response Text\n"

        for responseData in responses { // Assumes responses are already sorted by questionOrder
            let row = "\(responseData.questionOrder + 1),\(escapeCSV(responseData.questionText)),\(escapeCSV(responseData.responseText))\n"
            csvString.append(row)
        }
        return csvString
    }

    // MARK: - JSON Generation
    // Temporary Codable struct for JSON encoding
    private struct ExportableResponse: Codable {
        let questionNumber: Int16
        let questionText: String
        let responseText: String
    }

    private struct ExportableSurveyData: Codable {
        let surveyTitle: String
        let participantName: String
        let responses: [ExportableResponse]
    }

    func generateJSON() -> String {
        let exportableResponses = responses.map { responseData in
            ExportableResponse(
                questionNumber: responseData.questionOrder + 1,
                questionText: responseData.questionText,
                responseText: responseData.responseText
            )
        }

        let surveyData = ExportableSurveyData(
            surveyTitle: self.surveyTitle,
            participantName: self.participantName,
            responses: exportableResponses
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted // Make it human-readable

        do {
            let jsonData = try encoder.encode(surveyData)
            return String(data: jsonData, encoding: .utf8) ?? "{ \"error\": \"Failed to generate JSON\" }"
        } catch {
            print("Error generating JSON: \(error.localizedDescription)")
            return "{ \"error\": \"Failed to generate JSON: \(error.localizedDescription)\" }"
        }
    }
}
