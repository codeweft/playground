import Foundation
import CoreData
import Combine // For ObservableObject

class ParticipantViewModel: ObservableObject {
    @Published var name: String = ""
    @Published var details: String = ""

    private var participantToEdit: Participant?
    private let moc: NSManagedObjectContext

    init(moc: NSManagedObjectContext, participant: Participant? = nil) {
        self.moc = moc
        self.participantToEdit = participant

        if let participant = participant {
            self.name = participant.name ?? ""
            self.details = participant.details ?? ""
        }
    }

    func saveParticipant() {
        let participantToSave: Participant
        if let existingParticipant = participantToEdit {
            participantToSave = existingParticipant
        } else {
            participantToSave = Participant(context: moc)
            participantToSave.id = UUID() // Set ID for new participants
            participantToSave.createdAt = Date() // Set creation date for new participants
        }

        participantToSave.name = name.isEmpty ? nil : name // Store nil if name is empty
        participantToSave.details = details.isEmpty ? nil : details // Store nil if details are empty
        
        // If participantToSave is an ObservableObject and you want to manually trigger updates
        // for views observing it directly (though often changes are picked up via @FetchRequest or list view model refreshes):
        // participantToSave.objectWillChange.send()

        do {
            try moc.save()
        } catch {
            print("Error saving participant: \(error.localizedDescription)")
            // Implement more robust error handling in a production app
        }
    }

    func deleteParticipant() {
        guard let participantToDelete = participantToEdit else { return }
        moc.delete(participantToDelete)
        do {
            try moc.save()
        } catch {
            print("Error deleting participant: \(error.localizedDescription)")
            // Handle error appropriately
        }
    }
}
