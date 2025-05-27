import SwiftUI
import CoreData

struct StartInterviewSetupView: View {
    // Passed MOC from ContentView
    var moc: NSManagedObjectContext

    // Fetch requests to get surveys and participants
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Survey.title, ascending: true)],
        animation: .default)
    private var surveys: FetchedResults<Survey>

    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Participant.name, ascending: true)],
        animation: .default)
    private var participants: FetchedResults<Participant>

    @State private var selectedSurvey: Survey?
    @State private var selectedParticipant: Participant?

    // Instantiate SpeechService here for the interview session.
    // This makes it specific to one interview.
    // If SpeechService needs to be shared across the app or retain state
    // beyond a single interview, consider making it an @EnvironmentObject
    // or passing it from a higher-level coordinator.
    @StateObject private var speechService = SpeechService()

    var body: some View {
        Form {
            Section(header: Text("Select Survey")) {
                if surveys.isEmpty {
                    Text("No surveys available. Please create a survey first.")
                        .foregroundColor(.secondary)
                } else {
                    Picker("Survey", selection: $selectedSurvey) {
                        Text("Select a survey").tag(nil as Survey?) // Placeholder for no selection
                        ForEach(surveys) { survey in
                            Text(survey.title ?? "Untitled Survey").tag(survey as Survey?)
                        }
                    }
                }
            }

            Section(header: Text("Select Participant")) {
                if participants.isEmpty {
                    Text("No participants available. Please add a participant first.")
                        .foregroundColor(.secondary)
                } else {
                    Picker("Participant", selection: $selectedParticipant) {
                        Text("Select a participant").tag(nil as Participant?) // Placeholder
                        ForEach(participants) { participant in
                            Text(participant.name ?? "Unknown Participant").tag(participant as Participant?)
                        }
                    }
                }
            }

            Section {
                if let survey = selectedSurvey, let participant = selectedParticipant {
                    NavigationLink {
                        InterviewView(
                            moc: moc,
                            survey: survey,
                            participant: participant,
                            speechService: speechService
                        )
                    } label: {
                        HStack {
                            Spacer()
                            Text("Start Interview")
                                .font(.headline)
                            Spacer()
                        }
                    }
                    .disabled(false) // Explicitly enable
                } else {
                    VStack(alignment: .center) {
                        HStack {
                            Spacer()
                            Text("Please select both a survey and a participant to start the interview.")
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                            Spacer()
                        }
                    }
                    .padding(.vertical) // Add some padding to make it look like a disabled button area
                }
            }
        }
        .navigationTitle("Setup Interview")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Set default selections if none are made and lists are not empty
            if selectedSurvey == nil && !surveys.isEmpty {
                // selectedSurvey = surveys.first // Optionally auto-select first item
            }
            if selectedParticipant == nil && !participants.isEmpty {
                // selectedParticipant = participants.first // Optionally auto-select
            }
            // Ensure the moc is available for @FetchRequest by injecting it into the environment for this view
            // This is generally good practice if @FetchRequest is used in a view not directly getting it from App root.
        }
        // Ensure the environment has the moc for @FetchRequest to work correctly,
        // especially if this view is presented in a way that might break the environment chain.
        // However, since moc is passed and used for InterviewView, and @FetchRequest uses @Environment,
        // it should be fine as long as ContentView has .environment(\.managedObjectContext, moc) set by its parent (usually the App struct).
    }
}

// Preview for StartInterviewSetupView
struct StartInterviewSetupView_Previews: PreviewProvider {
    static var previews: some View {
        // Need to provide a MOC for the preview
        let previewMoc = PersistenceController.preview.container.viewContext
        
        // Create sample data for preview if needed
        let survey1 = Survey(context: previewMoc)
        survey1.title = "Tech Conference Feedback"
        survey1.id = UUID()
        survey1.createdAt = Date()
        
        let participant1 = Participant(context: previewMoc)
        participant1.name = "Jane Developer"
        participant1.id = UUID()
        participant1.createdAt = Date()
        
        do {
            try previewMoc.save()
        } catch {
            // Handle error
        }

        return NavigationView { // Wrap in NavigationView for title and link testing
            StartInterviewSetupView(moc: previewMoc)
                // Critical for @FetchRequest in previews:
                .environment(\.managedObjectContext, previewMoc)
        }
    }
}
