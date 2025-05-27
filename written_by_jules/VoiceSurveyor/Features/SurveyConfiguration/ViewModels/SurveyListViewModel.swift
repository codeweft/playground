import Foundation
import Combine
import CoreData // Required for Survey type

class SurveyListViewModel: ObservableObject {
    @Published var surveys: [Survey] = []
    private var persistenceService: PersistenceServiceProtocol

    init(persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        fetchSurveys()
    }

    func fetchSurveys(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) {
        do {
            surveys = try persistenceService.fetchSurveys(searchTerm: searchTerm, sortDescriptor: sortDescriptor)
        } catch {
            print("Error fetching surveys: \(error)")
            // Handle error appropriately, e.g., show an alert to the user
            surveys = [] // Ensure consistent state on error
        }
    }

    func deleteSurvey(at offsets: IndexSet) {
        let surveysToDelete = offsets.map { surveys[$0] }
        for survey in surveysToDelete {
            do {
                try persistenceService.deleteSurvey(survey: survey)
            } catch {
                print("Error deleting survey \(survey.title ?? "Untitled"): \(error)")
                // Handle error, perhaps by not removing it from the list or showing an alert
            }
        }
        // Refresh the list from the source of truth after deletion
        fetchSurveys()
    }
    
    func deleteSurvey(_ survey: Survey) {
        do {
            try persistenceService.deleteSurvey(survey: survey)
            fetchSurveys() // Refresh
        } catch {
            print("Error deleting survey \(survey.title ?? "Untitled"): \(error)")
            // Handle error
        }
    }
}
