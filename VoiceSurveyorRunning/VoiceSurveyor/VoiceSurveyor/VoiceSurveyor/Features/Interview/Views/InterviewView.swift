import SwiftUI

// MARK: - Button Styles
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color.blue)
            .foregroundColor(.white)
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeOut, value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color.gray.opacity(0.2))
            .foregroundColor(.blue)
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeOut, value: configuration.isPressed)
    }
}

struct WarningButtonStyle: ButtonStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color.red)
            .foregroundColor(.white)
            .clipShape(Capsule())
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeOut, value: configuration.isPressed)
    }
}


// MARK: - InterviewView
struct InterviewView: View {
    @StateObject var viewModel: InterviewViewModel
    @Environment(\.presentationMode) var presentationMode

    // Local states to reflect speech service activity, driven by viewModel
    @State private var isSpeechServiceListening: Bool = false
    @State private var isSpeechServiceSpeaking: Bool = false

    init(survey: Survey, participant: Participant, persistenceService: PersistenceServiceProtocol, speechService: SpeechServiceProtocol) {
        _viewModel = StateObject(wrappedValue: InterviewViewModel(
            survey: survey,
            participant: participant,
            speechService: speechService,
            persistenceService: persistenceService
        ))
    }

    var body: some View {
        VStack(spacing: 20) {
            // Header Information
            Group {
                Text("Participant: \(viewModel.participant.name ?? "N/A")")
                    .font(.headline)
                Text("Survey: \(viewModel.survey.title ?? "N/A")")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
            .padding(.horizontal)

            Spacer()

            // Central Display Area
            VStack {
                if isSpeechServiceSpeaking {
                    Text("🗣️ Speaking...")
                        .font(.title2)
                        .foregroundColor(.orange)
                        .transition(.opacity.animation(.easeInOut))
                }
                Text(viewModel.currentQuestionTextForDisplay)
                    .font(.title)
                    .multilineTextAlignment(.center)
                    .padding()
                    .frame(minHeight: 150) // Ensure space for question text
                
                if isSpeechServiceListening {
                    Text("🎤 Listening...")
                        .font(.title2)
                        .foregroundColor(.green)
                        .transition(.opacity.animation(.easeInOut))
                }

                if !viewModel.recognizedResponse.isEmpty && (isSpeechServiceListening || viewModel.interviewState.currentQuestionText != nil) {
                    Text("You said: \"\(viewModel.recognizedResponse)\"")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .padding()
                        .transition(.opacity.animation(.easeInOut))
                }
                
                if case .error(let message) = viewModel.interviewState {
                    Text("Error: \(message)")
                        .foregroundColor(.red)
                        .padding()
                }
            }
            .padding()

            Spacer()
            
            // Action Buttons
            actionButtonsView()
                .padding(.bottom)
        }
        .padding()
        .navigationTitle("Interview")
        .navigationBarBackButtonHidden(true) // Hide default back, manage with "Close" or "End Interview"
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if shouldShowCloseButton() {
                    Button("Close") {
                        presentationMode.wrappedValue.dismiss()
                    }
                }
            }
        }
        .onAppear {
            // Set up listeners for speech service states
            viewModel.speechService.isListening
                .assign(to: &$isSpeechServiceListening)
            viewModel.speechService.isSpeaking
                .assign(to: &$isSpeechServiceSpeaking)
        }
        .onDisappear {
            if viewModel.interviewState != .interviewFinished && viewModel.interviewState != .idle {
                 // Only finish if interview was started and not naturally finished
                 if case .error = viewModel.interviewState {
                     // If disappearing due to an error, might already be handled or just close.
                 } else {
                    viewModel.finishInterview()
                 }
            }
        }
    }
    
    @ViewBuilder
    private func actionButtonsView() -> some View {
        VStack(spacing: 15) {
            switch viewModel.interviewState {
            case .idle:
                Button("Start Interview") {
                    viewModel.startInterview()
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("StartInterviewButton")

            case .askingQuestion:
                // Typically no primary action here other than waiting for speech to finish
                // "Repeat Question" could be shown here if desired.
                Button("Repeat Question") {
                    viewModel.repeatQuestion()
                }
                .buttonStyle(SecondaryButtonStyle())
                .disabled(isSpeechServiceSpeaking) // Disable while speaking
                .accessibilityIdentifier("RepeatQuestionButton")


            case .listeningForResponse:
                Button("Done Speaking / Submit Response") {
                    // Use viewModel.recognizedResponse as it's bound to speechService.recognizedText
                    viewModel.responseCaptured(finalResponse: viewModel.recognizedResponse)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(viewModel.recognizedResponse.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && isSpeechServiceListening)
                .accessibilityIdentifier("SubmitResponseButton")
                
                HStack {
                    Button("Repeat") { viewModel.repeatQuestion() }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(isSpeechServiceSpeaking)
                        .accessibilityIdentifier("RepeatQuestionListeningButton")
                    Button("Skip") { viewModel.skipQuestion() }
                        .buttonStyle(SecondaryButtonStyle())
                        .accessibilityIdentifier("SkipQuestionButton")
                }


            case .processingResponse:
                Text("Processing your response...")
                    .font(.footnote)
                    .foregroundColor(.gray)
                ProgressView() // Show activity indicator

            case .interviewFinished:
                Text("Interview Complete!")
                    .font(.headline)
                Button("Close") {
                    presentationMode.wrappedValue.dismiss()
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("CloseButtonFinished")

            case .error:
                Text("An error occurred.")
                    .foregroundColor(.red)
                Button("Try Again / Start Over") { // Or specific error recovery
                    // This might need more logic in ViewModel to reset state appropriately
                    viewModel.finishInterview() // Clean up current state
                    viewModel.startInterview()  // Attempt to restart
                }
                .buttonStyle(WarningButtonStyle())
                .accessibilityIdentifier("TryAgainButton")
                Button("Close") {
                    presentationMode.wrappedValue.dismiss()
                }
                .buttonStyle(SecondaryButtonStyle())
                .accessibilityIdentifier("CloseButtonError")
            }

            // Common buttons available in multiple states (except idle, finished, processing)
            if shouldShowGeneralControls() {
                 Button("End Interview") {
                     viewModel.finishInterview()
                 }
                 .buttonStyle(WarningButtonStyle())
                 .padding(.top) // Add some space if other buttons are present
                 .accessibilityIdentifier("EndInterviewButton")
            }
        }
    }
    
    private func shouldShowGeneralControls() -> Bool {
        switch viewModel.interviewState {
        case .idle, .interviewFinished, .processingResponse, .error:
            return false
        default:
            return true
        }
    }
    
    private func shouldShowCloseButton() -> Bool {
        switch viewModel.interviewState {
        case .idle, .interviewFinished, .error:
            return true // Show for initial, finished, or error states in toolbar for easy exit
        default:
            return false // During active interview, rely on "End Interview"
        }
    }
}


// MARK: - Preview
struct InterviewView_Previews: PreviewProvider {
    static var previews: some View {
        // Use the preview context from PersistenceController
        let previewContext = PersistenceController.preview.container.viewContext
        let previewPersistenceService = PersistenceService(context: previewContext)
        let previewSpeechService = SpeechService() // Real or mock/stub

        // Create sample Survey
        let sampleSurvey = Survey(context: previewContext)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Customer Feedback (Preview)"
        sampleSurvey.createdAt = Date()

        let q1 = Question(context: previewContext)
        q1.id = UUID(); q1.text = "How satisfied are you with our service?"; q1.type = QuestionType.openEnded.rawValue; q1.order = 0; q1.survey = sampleSurvey
        let q2 = Question(context: previewContext)
        q2.id = UUID(); q2.text = "Would you recommend us to a friend?"; q2.type = QuestionType.singleChoice.rawValue; q2.options = "[\"Yes\", \"No\"]"; q2.order = 1; q2.survey = sampleSurvey
        
        sampleSurvey.addToQuestions(NSOrderedSet(array: [q1, q2]))


        // Create sample Participant
        let sampleParticipant = Participant(context: previewContext)
        sampleParticipant.id = UUID()
        sampleParticipant.name = "John Appleseed (Preview)"
        sampleParticipant.details = "Preview participant"

        do {
            try previewContext.save()
        } catch {
            print("Error saving preview context: \(error)")
        }
        
        // Return the InterviewView within a NavigationView for realistic preview
        return NavigationView {
            InterviewView(
                survey: sampleSurvey,
                participant: sampleParticipant,
                persistenceService: previewPersistenceService,
                speechService: previewSpeechService
            )
        }
    }
}
