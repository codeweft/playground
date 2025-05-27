import SwiftUI

struct ParticipantEditorView: View {
    @StateObject var viewModel: ParticipantEditorViewModel
    @Environment(\.presentationMode) var presentationMode
    
    @State private var showingAlert = false
    @State private var alertMessage = ""

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Participant Information")) {
                    TextField("Name", text: $viewModel.participantName)
                        .accessibilityIdentifier("ParticipantNameTextField")
                    
                    // Using TextEditor for multi-line input for details
                    VStack(alignment: .leading) {
                        Text("Details (Optional):")
                            .font(.caption)
                            .foregroundColor(.gray)
                        TextEditor(text: $viewModel.participantDetails)
                            .frame(height: 100) // Adjust height as needed
                            .overlay(
                                RoundedRectangle(cornerRadius: 5)
                                    .stroke(Color(UIColor.systemGray4), lineWidth: 1)
                            )
                            .accessibilityIdentifier("ParticipantDetailsTextEditor")
                    }
                }
            }
            .navigationTitle(viewModel.isNewParticipant ? "New Participant" : "Edit Participant")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        if viewModel.saveParticipant() {
                            presentationMode.wrappedValue.dismiss()
                        } else {
                            // Default error message, can be customized by viewModel
                            alertMessage = "Failed to save participant. Ensure name is not empty."
                            showingAlert = true
                        }
                    }
                    .accessibilityIdentifier("SaveParticipantButton")
                }
            }
            .alert(isPresented: $showingAlert) {
                Alert(title: Text("Save Error"), message: Text(alertMessage), dismissButton: .default(Text("OK")))
            }
        }
    }
}

struct ParticipantEditorView_Previews: PreviewProvider {
    static var previews: some View {
        // For a new participant
        let newParticipantVM = ParticipantEditorViewModel(
            persistenceService: PersistenceService(context: PersistenceController.preview.container.viewContext)
        )
        
        // For an existing participant
        let existingParticipant = Participant(context: PersistenceController.preview.container.viewContext)
        existingParticipant.id = UUID()
        existingParticipant.name = "Jane Doe"
        existingParticipant.details = "Frequent interviewee, provides detailed feedback."
        
        let existingParticipantVM = ParticipantEditorViewModel(
            participant: existingParticipant,
            persistenceService: PersistenceService(context: PersistenceController.preview.container.viewContext)
        )

        return Group {
            ParticipantEditorView(viewModel: newParticipantVM)
                .previewDisplayName("New Participant")
            
            ParticipantEditorView(viewModel: existingParticipantVM)
                .previewDisplayName("Edit Participant")
        }
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}
