import Foundation
import Combine
import CoreData // For Participant type

class ParticipantEditorViewModel: ObservableObject {
    @Published var participantName: String = ""
    @Published var participantDetails: String = ""
    @Published var isNewParticipant: Bool = true
    
    private var persistenceService: PersistenceServiceProtocol
    private var participant: Participant? // Holds the participant being edited, nil if new

    // Initializer for a new participant
    init(persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        self.isNewParticipant = true
        self.participant = nil
    }

    // Initializer for editing an existing participant
    init(participant: Participant, persistenceService: PersistenceServiceProtocol = PersistenceService()) {
        self.persistenceService = persistenceService
        self.participant = participant
        self.isNewParticipant = false
        self.participantName = participant.name ?? ""
        self.participantDetails = participant.details ?? ""
    }

    func saveParticipant() -> Bool {
        guard !participantName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            AppLogger.warning("Participant name cannot be empty.")
            // Optionally, set an error message property to display in the UI
            return false
        }

        do {
            if let existingParticipant = self.participant {
                // Update existing participant
                // Check if there are actual changes before calling update
                var hasChanges = false
                if existingParticipant.name != participantName {
                    hasChanges = true
                }
                if existingParticipant.details != participantDetails {
                     hasChanges = true
                }

                if hasChanges {
                    try persistenceService.updateParticipant(
                        participant: existingParticipant,
                        name: participantName,
                        details: participantDetails
                    )
                }
            } else {
                // Create new participant
                let newParticipant = try persistenceService.createParticipant(
                    name: participantName,
                    details: participantDetails
                )
                self.participant = newParticipant // Keep reference to the now existing participant
                self.isNewParticipant = false // It's no longer a new participant
            }
            
            // The individual CRUD methods in PersistenceService already call saveContext.
            // If your PersistenceService methods do not save automatically, you'd call it here:
            // try persistenceService.saveContext()

            return true
        } catch {
            AppLogger.error("Error saving participant: \(error.localizedDescription)")
            // Handle error appropriately (e.g., show alert to user, set error message property)
            return false
        }
    }
}
