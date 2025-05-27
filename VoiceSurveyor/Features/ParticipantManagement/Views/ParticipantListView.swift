import SwiftUI

struct ParticipantListView: View {
    @StateObject private var viewModel: ParticipantListViewModel
    @State private var showingParticipantEditor = false
    @State private var participantToEdit: Participant? = nil

    // Environment variable to access the managed object context
    @Environment(\.managedObjectContext) private var viewContext

    init(persistenceService: PersistenceServiceProtocol? = nil) {
        if let service = persistenceService {
            _viewModel = StateObject(wrappedValue: ParticipantListViewModel(persistenceService: service))
        } else {
            // Ensure this matches how PersistenceService is typically initialized in your app
            _viewModel = StateObject(wrappedValue: ParticipantListViewModel(persistenceService: PersistenceService(context: PersistenceController.shared.container.viewContext)))
        }
    }

    var body: some View {
        NavigationView {
            List {
                ForEach(viewModel.participants) { participant in
                    Button(action: {
                        self.participantToEdit = participant
                        self.showingParticipantEditor = true
                    }) {
                        VStack(alignment: .leading) {
                            Text(participant.name ?? "Unnamed Participant")
                                .font(.headline)
                            Text(participant.details ?? "No details")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                                .lineLimit(1) // Keep details concise in the list
                        }
                    }
                }
                .onDelete(perform: viewModel.deleteParticipant)
            }
            .navigationTitle("Participants")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        self.participantToEdit = nil // Ensure we're creating a new participant
                        self.showingParticipantEditor = true
                    } label: {
                        Label("New Participant", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingParticipantEditor, onDismiss: {
                viewModel.fetchParticipants() // Refresh list when editor is dismissed
            }) {
                if let participantToEdit = self.participantToEdit {
                    ParticipantEditorView(
                        viewModel: ParticipantEditorViewModel(participant: participantToEdit, persistenceService: viewModel.ps)
                    )
                } else {
                    ParticipantEditorView(
                        viewModel: ParticipantEditorViewModel(persistenceService: viewModel.ps)
                    )
                }
            }
            .onAppear {
                viewModel.fetchParticipants()
            }
        }
    }
}

struct ParticipantListView_Previews: PreviewProvider {
    static var previews: some View {
        let previewPersistenceController = PersistenceController.preview
        let previewService = PersistenceService(context: previewPersistenceController.container.viewContext)

        // Add sample participants for the preview if not already present
        // The PersistenceController.preview might already create some.
        // For example:
        // try? previewService.createParticipant(name: "Alice Wonderland", details: "Loves tea parties")
        // try? previewService.createParticipant(name: "Bob The Builder", details: "Can he fix it? Yes!")

        return ParticipantListView(persistenceService: previewService)
            .environment(\.managedObjectContext, previewPersistenceController.container.viewContext)
    }
}
