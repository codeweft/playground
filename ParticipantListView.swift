import SwiftUI
import CoreData

struct ParticipantListView: View {
    @StateObject private var participantListViewModel: ParticipantListViewModel
    @Environment(\.managedObjectContext) private var moc // moc is also in participantListViewModel

    @State private var showingAddParticipantSheet = false
    @State private var participantToEdit: Participant? = nil

    // Initializer to inject the managed object context
    init(moc: NSManagedObjectContext) {
        _participantListViewModel = StateObject(wrappedValue: ParticipantListViewModel(moc: moc))
    }
    
    // Alternative initializer if moc is to be taken from environment directly
    // However, StateObject initialization often requires explicit passing.
    // init() {
    //     // This pattern is problematic if moc from @Environment is not yet available during init.
    //     // It's safer to pass moc explicitly as shown above.
    //     let context = PersistenceController.shared.container.viewContext // Example of getting context
    //     _participantListViewModel = StateObject(wrappedValue: ParticipantListViewModel(moc: context))
    // }


    var body: some View {
        NavigationView {
            List {
                ForEach(participantListViewModel.participants) { participant in
                    Button(action: {
                        self.participantToEdit = participant // Set participantToEdit to trigger the edit sheet
                    }) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(participant.name ?? "Unnamed Participant")
                                    .font(.headline)
                                Text(participant.details ?? "No additional details")
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                                    .lineLimit(1)
                            }
                            Spacer()
                            // Optionally, show number of responses or other details
                        }
                    }
                    .foregroundColor(.primary) // Ensure text color is appropriate for a button label
                }
                .onDelete(perform: participantListViewModel.deleteParticipant)
            }
            .navigationTitle("Participants")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        self.participantToEdit = nil // Ensure we are adding a new participant
                        self.showingAddParticipantSheet = true
                    } label: {
                        Label("Add Participant", systemImage: "plus")
                    }
                }
            }
            .onAppear {
                // Fetch participants when the view appears
                participantListViewModel.fetchParticipants()
            }
            // Sheet for Adding a new participant
            .sheet(isPresented: $showingAddParticipantSheet, onDismiss: {
                participantListViewModel.fetchParticipants() // Refresh list on dismiss
            }) {
                ParticipantEditView(moc: self.moc) // Pass moc, participantToEdit will be nil
            }
            // Sheet for Editing an existing participant (triggered by participantToEdit not being nil)
            .sheet(item: $participantToEdit, onDismiss: {
                participantListViewModel.fetchParticipants() // Refresh list on dismiss
            }) { participant in // 'participant' here is the item from $participantToEdit
                ParticipantEditView(moc: self.moc, participantToEdit: participant)
            }
        }
    }
}

struct ParticipantListView_Previews: PreviewProvider {
    static var previews: some View {
        // Use the preview context from PersistenceController
        ParticipantListView(moc: PersistenceController.preview.container.viewContext)
            .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}
