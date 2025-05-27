import Foundation
import Combine
import CoreData // Required for Participant type

class ParticipantListViewModel: ObservableObject {
    @Published var participants: [Participant] = []
    private var persistenceService: PersistenceServiceProtocol

    // Public accessor for persistenceService if needed by views to pass to other view models
    var ps: PersistenceServiceProtocol {
        return persistenceService
    }

    init(persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        fetchParticipants()
    }

    func fetchParticipants(searchTerm: String? = nil, sortDescriptor: NSSortDescriptor? = nil) {
        do {
            // Default sort descriptor if none provided (e.g., by name ascending)
            let defaultSort = NSSortDescriptor(keyPath: \Participant.name, ascending: true)
            participants = try persistenceService.fetchParticipants(searchTerm: searchTerm, sortDescriptor: sortDescriptor ?? defaultSort)
        } catch {
            AppLogger.error("Error fetching participants: \(error.localizedDescription)", tag: "ParticipantListVM")
            // Handle error appropriately, e.g., show an alert to the user
            participants = [] // Ensure consistent state on error
        }
    }

    func deleteParticipant(at offsets: IndexSet) {
        let participantsToDelete = offsets.map { participants[$0] }
        for participant in participantsToDelete {
            do {
                try persistenceService.deleteParticipant(participant: participant)
            } catch {
                AppLogger.error("Error deleting participant \(participant.name ?? "Unknown"): \(error.localizedDescription)", tag: "ParticipantListVM")
                // Handle error, perhaps by not removing it from the list or showing an alert
            }
        }
        // Refresh the list from the source of truth after deletion
        // This is important because the deletion might fail, or the list might have changed.
        fetchParticipants()
    }
    
    func deleteParticipant(_ participant: Participant) {
        do {
            try persistenceService.deleteParticipant(participant: participant)
            fetchParticipants() // Refresh list
        } catch {
            AppLogger.error("Error deleting participant \(participant.name ?? "Unknown"): \(error.localizedDescription)", tag: "ParticipantListVM")
            // Handle error
        }
    }
}
