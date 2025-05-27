import SwiftUI
import CoreData

struct InterviewView: View {
    @StateObject private var interviewViewModel: InterviewViewModel
    // speechService is managed by the interviewViewModel, so direct observation here
    // might be redundant if all relevant state is exposed through interviewViewModel.
    // However, for direct control like "Skip Speaking", it's useful to have.
    @ObservedObject private var speechService: SpeechService
    
    @Environment(\.dismiss) private var dismiss

    // Initializer
    init(moc: NSManagedObjectContext, survey: Survey, participant: Participant, speechService: SpeechService) {
        let viewModel = InterviewViewModel(
            moc: moc,
            survey: survey,
            participant: participant,
            speechService: speechService
        )
        _interviewViewModel = StateObject(wrappedValue: viewModel)
        _speechService = ObservedObject(wrappedValue: speechService)
    }

    var body: some View {
        VStack(spacing: 20) {
            Text("Interview")
                .font(.largeTitle)
                .padding(.bottom)

            // Current Question
            Text(interviewViewModel.currentQuestionText)
                .font(.title2)
                .multilineTextAlignment(.center)
                .padding()
                .frame(minHeight: 100) // Ensure space for question text

            // Response Area
            VStack {
                Text("Your response:")
                    .font(.headline)
                Text(interviewViewModel.currentResponseText.isEmpty ? "..." : interviewViewModel.currentResponseText)
                    .font(.body)
                    .italic()
                    .foregroundColor(.gray)
                    .frame(minHeight: 60, alignment: .top)
                    .padding()
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.5), lineWidth: 1)
                    )
            }
            .padding(.horizontal)


            // Interview State Display
            Text("Status: \(interviewStateDescription(interviewViewModel.interviewState))")
                .font(.caption)
                .foregroundColor(.secondary)

            // Controls
            Group {
                if interviewViewModel.interviewState == .idle || interviewViewModel.interviewState == .finished || interviewViewModel.interviewState == .error {
                    Button("Start Interview") {
                        interviewViewModel.startInterview()
                    }
                    .buttonStyle(BigButtonStyle(backgroundColor: .blue))
                }

                if interviewViewModel.interviewState == .askingQuestion && speechService.isSpeaking {
                    Button("Skip Speaking") {
                        speechService.speechSynthesizer.stopSpeaking(at: .immediate)
                        // The ViewModel's subscription to speechService.$isSpeaking will handle the transition
                    }
                    .buttonStyle(BigButtonStyle(backgroundColor: .orange))
                }
                
                if interviewViewModel.interviewState == .listening {
                    Button("Stop Listening & Submit Answer") {
                        interviewViewModel.stopListeningAndProcessResponse()
                    }
                    .buttonStyle(BigButtonStyle(backgroundColor: .red))
                }

                // Repeat Question Button (available when not speaking, not recording, and not finished)
                if !speechService.isSpeaking && !speechService.isRecording &&
                   (interviewViewModel.interviewState == .askingQuestion || interviewViewModel.interviewState == .listening || interviewViewModel.interviewState == .processingResponse) {
                    Button("Repeat Question") {
                        interviewViewModel.repeatQuestion()
                    }
                    .buttonStyle(BigButtonStyle(backgroundColor: .green))
                }
            }
            .padding(.horizontal)
            
            Spacer() // Pushes controls and error to bottom if less content

            // Error Display
            if let error = interviewViewModel.interviewError {
                Text("Error: \(error)")
                    .foregroundColor(.red)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .padding()
            }
            
            // End Interview Button
            Button("End Interview") {
                dismiss()
            }
            .buttonStyle(BigButtonStyle(backgroundColor: .gray))
            .padding(.horizontal)
            .padding(.bottom)
        }
        .padding()
        .onAppear {
            // Start the interview automatically when the view appears if state is idle
            if interviewViewModel.interviewState == .idle {
                 interviewViewModel.startInterview()
            }
        }
        .onDisappear {
            interviewViewModel.cleanup() // Use the cleanup method from ViewModel
        }
    }
    
    private func interviewStateDescription(_ state: InterviewViewModel.InterviewState) -> String {
        switch state {
        case .idle: return "Idle"
        case .askingQuestion: return "Asking question..."
        case .listening: return "Listening..."
        case .processingResponse: return "Processing response..."
        case .finished: return "Finished"
        case .error: return "Error"
        }
    }
}

// Custom Button Style for consistent look
struct BigButtonStyle: ButtonStyle {
    var backgroundColor: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(backgroundColor)
            .foregroundColor(.white)
            .cornerRadius(10)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}


// MARK: - Preview
struct InterviewView_Previews: PreviewProvider {
    static var previews: some View {
        // Create mock/preview instances
        let moc = PersistenceController.preview.container.viewContext
        
        let sampleSurvey = Survey(context: moc)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Sample Customer Feedback Survey"
        sampleSurvey.createdAt = Date()

        let question1 = Question(context: moc)
        question1.id = UUID()
        question1.text = "What is your favorite feature of our product?"
        question1.questionType = "openEnded"
        question1.order = 0
        sampleSurvey.addToQuestions(question1) // Assumes addToQuestions is generated

        let question2 = Question(context: moc)
        question2.id = UUID()
        question2.text = "How likely are you to recommend our product to a friend?"
        question2.questionType = "openEnded"
        question2.order = 1
        sampleSurvey.addToQuestions(question2)
        
        let sampleParticipant = Participant(context: moc)
        sampleParticipant.id = UUID()
        sampleParticipant.name = "Jane Doe"
        sampleParticipant.createdAt = Date()

        // It's good practice to save the preview context to ensure data is available
        do {
            try moc.save()
        } catch {
            print("Preview save error: \(error)")
        }

        let speechService = SpeechService() // Real service for preview, or a mock

        return InterviewView(
            moc: moc,
            survey: sampleSurvey,
            participant: sampleParticipant,
            speechService: speechService
        )
    }
}
