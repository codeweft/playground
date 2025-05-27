import Foundation
import CoreData
import Combine // For ObservableObject and cancellables
import Speech // For SFSpeechRecognizerAuthorizationStatus if needed directly, though SpeechService handles it

class InterviewViewModel: ObservableObject {

    // MARK: - Enum for Interview State
    enum InterviewState {
        case idle, askingQuestion, listening, processingResponse, finished, error
    }

    // MARK: - Published Properties
    @Published var currentQuestionIndex: Int = -1
    @Published var currentQuestionText: String = "Loading interview..."
    @Published var currentResponseText: String = "" // From speechService.recognizedText
    @Published var interviewState: InterviewState = .idle
    @Published var interviewError: String? = nil

    // MARK: - Core Properties
    private let survey: Survey
    private let participant: Participant
    private let speechService: SpeechService
    private let moc: NSManagedObjectContext

    private var questions: [Question] = []
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initializer
    init(moc: NSManagedObjectContext, survey: Survey, participant: Participant, speechService: SpeechService) {
        self.moc = moc
        self.survey = survey
        self.participant = participant
        self.speechService = speechService

        // Load and sort questions
        if let surveyQuestions = survey.questions as? Set<Question> {
            self.questions = surveyQuestions.sorted { $0.order < $1.order }
        } else {
            self.questions = []
            self.interviewError = "Failed to load questions for the survey."
            self.interviewState = .error
        }
        
        if self.questions.isEmpty && self.interviewState != .error {
            self.currentQuestionText = "No questions in this survey."
            self.interviewState = .finished // Or .error if no questions is an error condition
        }

        // Subscribe to SpeechService publishers
        speechService.$recognizedText
            .receive(on: DispatchQueue.main)
            .assign(to: &$currentResponseText)

        speechService.$isSpeaking
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isSpeaking in
                guard let self = self else { return }
                if !isSpeaking && self.interviewState == .askingQuestion {
                    // Transition to listening once the question has been fully spoken
                    self.startListening()
                }
            }
            .store(in: &cancellables)

        // speechService.$isRecording can be observed if needed for UI, but state is managed by interviewState

        speechService.$speechError
            .receive(on: DispatchQueue.main)
            .sink { [weak self] errorText in
                if let errorText = errorText, !errorText.isEmpty {
                    self?.interviewError = errorText
                    // self?.interviewState = .error // Decide if every speech error stops the interview
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Interview Flow Functions
    func startInterview() {
        currentQuestionIndex = -1
        interviewError = nil
        currentResponseText = ""
        
        if questions.isEmpty {
            currentQuestionText = "This survey has no questions. Interview cannot start."
            interviewState = .error
            speechService.speak(text: currentQuestionText)
            return
        }
        
        nextQuestion()
    }

    func nextQuestion() {
        guard interviewState != .processingResponse else {
            // Avoid advancing if we are already in the middle of processing a previous response
            // This can happen if nextQuestion is called too quickly (e.g. from delay and user action)
            return
        }

        if currentQuestionIndex + 1 < questions.count {
            currentQuestionIndex += 1
            let question = questions[currentQuestionIndex]
            currentQuestionText = question.text ?? "No question text available."
            currentResponseText = "" // Clear previous response text
            interviewState = .askingQuestion
            speechService.speak(text: currentQuestionText)
        } else {
            finishInterview()
        }
    }

    func startListening() {
        // Ensure we are not in an error state and the question has finished being asked
        guard interviewState == .askingQuestion || interviewState == .listening, // Allow re-starting listening
              !speechService.isSpeaking,
              currentQuestionIndex < questions.count else { // Ensure there's a question to listen for
            // If called inappropriately, either ignore or set an error state
            // print("Debug: startListening called but conditions not met. State: \(interviewState), isSpeaking: \(speechService.isSpeaking)")
            if speechService.isSpeaking && interviewState == .askingQuestion {
                 // This case is handled by the $isSpeaking publisher chain.
                 // If user skips speaking, isSpeaking becomes false, then this is called.
            }
            return
        }
        
        interviewState = .listening
        speechService.startRecording()
    }

    func stopListeningAndProcessResponse() {
        guard interviewState == .listening else { return } // Only process if currently listening
        
        speechService.stopRecording() // This will eventually update speechService.recognizedText
        interviewState = .processingResponse
        
        // Use the text from speechService as it's the most up-to-date recognized text
        let responseToSave = speechService.recognizedText
        saveResponse(text: responseToSave)
        
        // Update UI with the final recognized text immediately
        self.currentResponseText = responseToSave

        // Delay before moving to the next question to allow user to see the processed response
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { // Adjust delay as needed
            // Ensure state hasn't changed due to other actions (e.g., user ending interview)
            if self.interviewState == .processingResponse {
                 self.nextQuestion()
            }
        }
    }

    private func saveResponse(text: String) {
        guard currentQuestionIndex >= 0 && currentQuestionIndex < questions.count else {
            interviewError = "Error: Invalid question index, cannot save response."
            interviewState = .error
            return
        }

        let currentQuestionEntity = questions[currentQuestionIndex]

        let newResponse = Response(context: moc)
        newResponse.id = UUID()
        newResponse.responseText = text
        newResponse.recordedAt = Date()
        newResponse.question = currentQuestionEntity
        newResponse.survey = self.survey
        newResponse.participant = self.participant

        do {
            try moc.save()
        } catch {
            interviewError = "Failed to save response: \(error.localizedDescription)"
            // Potentially set interviewState to .error, or allow retry?
            // For now, just log and continue. User might want to re-record or skip.
            print("Error saving response: \(error.localizedDescription)")
        }
    }

    func repeatQuestion() {
        guard currentQuestionIndex >= 0 && currentQuestionIndex < questions.count else {
            interviewError = "No current question to repeat."
            return
        }
        // Ensure not currently speaking or recording.
        guard !speechService.isSpeaking && !speechService.isRecording else { return }

        interviewState = .askingQuestion // Set state back to asking
        speechService.speak(text: currentQuestionText)
    }

    func finishInterview() {
        interviewState = .finished
        currentQuestionText = "Interview complete!"
        // Optionally, provide a summary or thank you message.
        speechService.speak(text: "Interview complete. Thank you for your participation!")
    }
    
    // Call this if the view is dismissed or interview is manually ended
    func cleanup() {
        if speechService.isSpeaking {
            speechService.speechSynthesizer.stopSpeaking(at: .immediate)
        }
        if speechService.isRecording {
            speechService.stopRecording()
        }
        cancellables.forEach { $0.cancel() } // Cancel subscriptions
        print("InterviewViewModel cleaned up.")
    }
}
