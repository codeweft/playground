import Foundation
import CoreData
import Combine // For ObservableObject

class ParticipantListViewModel: ObservableObject {
    @Published var participants: [Participant] = []
    private let moc: NSManagedObjectContext

    init(moc: NSManagedObjectContext) {
        self.moc = moc
        // fetchParticipants() // Called from onAppear in the View for better UI update timing
    }

    func fetchParticipants() {
        let request: NSFetchRequest<Participant> = Participant.fetchRequest()
        // Ensure 'createdAt' is a valid key path on your Participant entity
        request.sortDescriptors = [NSSortDescriptor(keyPath: \Participant.createdAt, ascending: true)]

        do {
            participants = try moc.fetch(request)
        } catch {
            print("Error fetching participants: \(error.localizedDescription)")
            // Handle fetch error appropriately in a production app
        }
    }

    func deleteParticipant(at offsets: IndexSet) {
        offsets.map { participants[$0] }.forEach(moc.delete)

        do {
            try moc.save()
            // After saving, re-fetch or remove from the local array to update UI
            // Re-fetching is safer to ensure consistency with the persistent store
            fetchParticipants()
            // Or, if you are sure the save was successful and want to avoid a fetch:
            // participants.remove(atOffsets: offsets)
        } catch {
            print("Error deleting participant: \(error.localizedDescription)")
            // Handle delete error appropriately
            // Consider re-fetching or rolling back UI changes if save fails
        }
    }
}
