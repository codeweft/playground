import Foundation
import Combine
import CoreData // For Survey, SurveyResponse, IndividualResponse, Question

// MARK: - Helper Structs for Display
struct DisplayableSurveyResponse: Identifiable {
    let id: UUID
    let participantName: String
    let interviewDate: Date
    let responses: [DisplayableIndividualResponse]
    let originalResponseObject: SurveyResponse // To keep a reference if needed for other operations
}

struct DisplayableIndividualResponse: Identifiable {
    let id: UUID // This will be the IndividualResponse's ID
    let questionText: String
    let responseText: String
    let questionType: String
}

// MARK: - Helper Structs for Export (Codable)
struct ExportableSurveyResponse: Codable {
    let id: UUID
    let surveyTitle: String // Added for context in export
    let participantName: String
    let interviewDate: String // ISO 8601 formatted
    let responses: [ExportableIndividualResponse]
}

struct ExportableIndividualResponse: Codable {
    let questionText: String
    let responseText: String
    let questionType: String
    // let questionOrder: Int16? // Potentially add if order is important in export
}

// MARK: - ExportError Enum
enum ExportError: Error, LocalizedError {
    case noDataToExport
    case csvGenerationFailed(String)
    case jsonGenerationFailed(String)
    case dataEncodingFailed

    var errorDescription: String? {
        switch self {
        case .noDataToExport:
            return "There are no survey responses to export."
        case .csvGenerationFailed(let message):
            return "Failed to generate CSV data: \(message)"
        case .jsonGenerationFailed(let message):
            return "Failed to generate JSON data: \(message)"
        case .dataEncodingFailed:
            return "Failed to encode data for export."
        }
    }
}

// MARK: - SurveyResultsViewModel
class SurveyResultsViewModel: ObservableObject {

    @Published var survey: Survey
    @Published var surveyResponses: [DisplayableSurveyResponse] = []
    @Published var isLoading: Bool = false
    @Published var errorMessage: String? = nil

    private var persistenceService: PersistenceServiceProtocol

    init(survey: Survey, persistenceService: PersistenceServiceProtocol) {
        self.survey = survey
        self.persistenceService = persistenceService
        fetchResults()
    }

    func fetchResults() {
        isLoading = true
        errorMessage = nil
        surveyResponses = []

        do {
            let fetchedResponses = try persistenceService.fetchSurveyResponses(for: survey, participant: nil)
            
            self.surveyResponses = fetchedResponses.map { sr in
                let displayableIndividualResponses = (sr.individualResponses as? Set<IndividualResponse> ?? [])
                    .sorted { // Sort by original question order if possible
                        // This requires access to the original Question objects or storing order on IndividualResponse
                        // For now, let's assume IndividualResponse might store questionText, which isn't ideal for sorting by original order.
                        // If Question objects were directly linked and sorted, that would be better.
                        // Placeholder sort: by question text. A more robust solution would involve question order.
                        ($0.questionText ?? "") < ($1.questionText ?? "")
                    }
                    .map { ir in
                    DisplayableIndividualResponse(
                        id: ir.id ?? UUID(),
                        questionText: ir.questionText ?? "N/A",
                        responseText: ir.responseText ?? "N/A",
                        questionType: ir.questionType ?? "N/A"
                    )
                }
                
                return DisplayableSurveyResponse(
                    id: sr.id ?? UUID(),
                    participantName: sr.participant?.name ?? "Unknown Participant",
                    interviewDate: sr.interviewDate ?? Date(),
                    responses: displayableIndividualResponses,
                    originalResponseObject: sr
                )
            }
            .sorted { $0.interviewDate > $1.interviewDate } // Sort responses by date, newest first

        } catch {
            errorMessage = "Failed to fetch survey results: \(error.localizedDescription)"
            AppLogger.error("Failed to fetch survey results: \(error.localizedDescription)")
        }
        isLoading = false
    }

    // MARK: - Export Logic
    func generateCSVData() -> Result<Data, Error> {
        guard !surveyResponses.isEmpty else {
            return .failure(ExportError.noDataToExport)
        }

        var csvString = "Participant Name,Interview Date,Question Text,Response Text,Question Type\n"

        for response in surveyResponses {
            let participantName = escapeCSVField(response.participantName)
            let interviewDate = escapeCSVField(formatDate(response.interviewDate))

            if response.responses.isEmpty {
                // Add a row even if there are no individual responses for this survey response
                csvString += "\(participantName),\(interviewDate),,,,\n"
            } else {
                for individualResponse in response.responses {
                    let questionText = escapeCSVField(individualResponse.questionText)
                    let responseText = escapeCSVField(individualResponse.responseText)
                    let questionType = escapeCSVField(individualResponse.questionType)
                    csvString += "\(participantName),\(interviewDate),\(questionText),\(responseText),\(questionType)\n"
                }
            }
        }

        if let data = csvString.data(using: .utf8) {
            return .success(data)
        } else {
            return .failure(ExportError.dataEncodingFailed)
        }
    }

    func generateJSONData() -> Result<Data, Error> {
        guard !surveyResponses.isEmpty else {
            return .failure(ExportError.noDataToExport)
        }

        let exportableResponses = surveyResponses.map { dsr -> ExportableSurveyResponse in
            let individualResponses = dsr.responses.map { dir -> ExportableIndividualResponse in
                ExportableIndividualResponse(
                    questionText: dir.questionText,
                    responseText: dir.responseText,
                    questionType: dir.questionType
                )
            }
            return ExportableSurveyResponse(
                id: dsr.id,
                surveyTitle: survey.title ?? "Untitled Survey",
                participantName: dsr.participantName,
                interviewDate: formatDateISO(dsr.interviewDate),
                responses: individualResponses
            )
        }

        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted // Make it human-readable

        do {
            let jsonData = try encoder.encode(exportableResponses)
            return .success(jsonData)
        } catch {
            return .failure(ExportError.jsonGenerationFailed(error.localizedDescription))
        }
    }

    // MARK: - Helper Methods
    func escapeCSVField(_ field: String) -> String {
        var escapedField = field
        // If field contains a comma, newline, or double quote, enclose in double quotes
        if escapedField.contains(",") || escapedField.contains("\n") || escapedField.contains("\"") {
            // Escape existing double quotes by doubling them
            escapedField = escapedField.replacingOccurrences(of: "\"", with: "\"\"")
            escapedField = "\"\(escapedField)\""
        }
        return escapedField
    }

    func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    
    func formatDateISO(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
