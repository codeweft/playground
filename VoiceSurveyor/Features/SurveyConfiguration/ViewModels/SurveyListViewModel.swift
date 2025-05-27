import Foundation
import Combine
import CoreData // Required for Survey type

@MainActor // Add this attribute
class SurveyListViewModel: ObservableObject {
    @Published var surveys: [Survey] = []
    @Published var errorMessage: String? = nil
    private var persistenceService: PersistenceServiceProtocol

    init(persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        // Call the async fetchSurveys in a Task
        Task { [weak self] in // Use [weak self] to avoid potential retain cycles
            await self?.fetchSurveys()
        }
    }

    // @MainActor implicitly applies here due to class annotation
    func fetchSurveys(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) async {
        self.errorMessage = nil // Clear previous errors
        do {
            surveys = try await persistenceService.fetchSurveys(searchTerm: searchTerm, sortDescriptor: sortDescriptor)
        } catch {
            AppLogger.error("Error fetching surveys: \(error.localizedDescription)", tag: "SurveyListVM")
            self.errorMessage = "Failed to fetch surveys: \(error.localizedDescription)"
            surveys = [] // Ensure consistent state on error
        }
    }

    // @MainActor implicitly applies here
    func deleteSurvey(at offsets: IndexSet) async {
        let surveysToDelete = offsets.map { surveys[$0] }
        // var anErrorOccurred = false // Can be removed if not used to alter flow beyond setting errorMessage
        for survey in surveysToDelete {
            do {
                try await persistenceService.deleteSurvey(survey: survey)
            } catch {
                AppLogger.error("Error deleting survey '\(survey.title ?? "Untitled")': \(error.localizedDescription)", tag: "SurveyListVM")
                self.errorMessage = "Failed to delete survey '\(survey.title ?? "Untitled")': \(error.localizedDescription)"
                // anErrorOccurred = true // Mark that an error occurred
            }
        }
        await fetchSurveys() // Call the async version
    }
    
    // @MainActor implicitly applies here
    func deleteSurvey(_ survey: Survey) async {
        do {
            try await persistenceService.deleteSurvey(survey: survey)
            // await fetchSurveys() // Refresh - moved to finally-like common call
        } catch {
            AppLogger.error("Error deleting survey '\(survey.title ?? "Untitled")': \(error.localizedDescription)", tag: "SurveyListVM")
            self.errorMessage = "Failed to delete survey '\(survey.title ?? "Untitled")': \(error.localizedDescription)"
        }
        await fetchSurveys() // Ensure fetchSurveys is called regardless of success/failure of delete
    }
}
