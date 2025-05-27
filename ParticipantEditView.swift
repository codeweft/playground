import SwiftUI
import CoreData

struct ParticipantEditView: View {
    @StateObject private var participantViewModel: ParticipantViewModel
    @Environment(\.dismiss) private var dismiss
    // The moc is passed to the ViewModel, so direct access here is optional
    // @Environment(\.managedObjectContext) private var moc

    // Initializer to inject the managed object context and an optional participant to edit
    init(moc: NSManagedObjectContext, participantToEdit: Participant? = nil) {
        _participantViewModel = StateObject(wrappedValue: ParticipantViewModel(moc: moc, participant: participantToEdit))
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Participant Information")) {
                    TextField("Name (Optional)", text: $participantViewModel.name)
                    
                    // Using TextEditor for potentially multi-line details
                    ZStack(alignment: .topLeading) {
                        if participantViewModel.details.isEmpty {
                            Text("Details (Optional)")
                                .foregroundColor(Color(UIColor.placeholderText))
                                .padding(.top, 8) // Approximate padding for TextEditor
                                .padding(.leading, 5) // Approximate padding for TextEditor
                        }
                        TextEditor(text: $participantViewModel.details)
                            .frame(minHeight: 100) // Give some space for details
                    }
                }
            }
            .navigationTitle(participantViewModel.name.isEmpty && participantViewModel.details.isEmpty ? "Add Participant" : "Edit Participant") // Heuristic title
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        participantViewModel.saveParticipant()
                        dismiss()
                    }
                    // Optionally, disable Save button if no relevant data is entered
                    // .disabled(participantViewModel.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                    //            participantViewModel.details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

// MARK: - Preview
struct ParticipantEditView_Previews: PreviewProvider {
    static var previews: some View {
        let moc = PersistenceController.preview.container.viewContext

        // Preview for adding a new participant
        NavigationView {
            ParticipantEditView(moc: moc)
        }
        .previewDisplayName("Add Participant")

        // Preview for editing an existing participant
        let sampleParticipant = Participant(context: moc)
        sampleParticipant.id = UUID()
        sampleParticipant.name = "John Doe"
        sampleParticipant.details = "Met at the conference."
        sampleParticipant.createdAt = Date()
        
        // It's good practice to save the preview context if your view relies on persisted data
        // or if the ViewModel's init logic fetches/relies on the object being in the store.
        // For this simple case, it might not be strictly necessary but doesn't hurt.
        // try? moc.save()

        return NavigationView {
            ParticipantEditView(moc: moc, participantToEdit: sampleParticipant)
        }
        .previewDisplayName("Edit Participant")
    }
}
