import Foundation
import Combine
import CoreData // For Survey, Participant, Question types
import AVFoundation

// MARK: - Array Extension for safe access
extension Array {
    func get(at index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

// MARK: - InterviewState Enum
enum InterviewState: Equatable {
    case idle
    case askingQuestion(questionText: String)
    case listeningForResponse(questionText: String)
    case processingResponse(questionText: String, responseText: String)
    case interviewFinished
    case error(message: String)

    var displayText: String {
        switch self {
        case .idle: return "Ready to start."
        case .askingQuestion(let questionText): return "Asking: \"\(questionText)\""
        case .listeningForResponse: return "Listening for your response..."
        case .processingResponse(_, let responseText): return "You said: \"\(responseText)\". Processing..."
        case .interviewFinished: return "Interview finished. Thank you!"
        case .error(let message): return "Error: \(message)"
        }
    }
    
    var currentQuestionText: String? {
        switch self {
        case .askingQuestion(let text), .listeningForResponse(let text), .processingResponse(let text, _):
            return text
        default:
            return nil
        }
    }
}

// MARK: - InterviewViewModel
class InterviewViewModel: ObservableObject {

    // MARK: - Published Properties
    @Published var survey: Survey
    @Published var participant: Participant
    @Published var interviewState: InterviewState = .idle {
        didSet {
            currentQuestionTextForDisplay = interviewState.displayText
            userActionRequired = shouldRequireUserAction(for: interviewState)
        }
    }
    @Published var currentQuestionTextForDisplay: String = "Initializing..."
    @Published var recognizedResponse: String = ""
    @Published var userActionRequired: Bool = false // To enable/disable UI controls like "Start Listening"

    // MARK: - Services
    private var speechService: SpeechServiceProtocol
    private var persistenceService: PersistenceServiceProtocol

    // MARK: - Internal State
    private var questions: [Question] = []
    private var currentQuestionIndex: Int = -1
    private var surveyResponse: SurveyResponse?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Speech Parameters
    private let speechLanguage: String = "en-US" // Default, could be configurable
    private let speechRate: Float = AVSpeechUtteranceDefaultSpeechRate
    private let speechPitch: Float = 1.0

    // MARK: - Initialization
    init(survey: Survey,
         participant: Participant,
         speechService: SpeechServiceProtocol,
         persistenceService: PersistenceServiceProtocol) {
        self.survey = survey
        self.participant = participant
        self.speechService = speechService
        self.persistenceService = persistenceService
        
        loadQuestions()
        setupBindings()
        self.currentQuestionTextForDisplay = interviewState.displayText // Initial display text
    }

    deinit {
        print("InterviewViewModel deinit")
        speechService.stopListening()
        speechService.stopSpeaking()
        cancellables.forEach { $0.cancel() }
    }

    // MARK: - Core Logic
    private func loadQuestions() {
        guard let fetchedQuestions = survey.questions as? NSOrderedSet else {
            interviewState = .error(message: "Could not load questions from survey.")
            return
        }
        self.questions = fetchedQuestions.array.compactMap { $0 as? Question }
                                       .sorted { $0.order < $1.order } // Ensure sorted by order
        if questions.isEmpty {
            interviewState = .error(message: "Survey has no questions.")
        }
    }

    private func setupBindings() {
        // Speech Service Bindings
        speechService.isListening
            .sink { [weak self] isListening in
                guard let self = self else { return }
                if !isListening, case .listeningForResponse = self.interviewState {
                    // If listening stops unexpectedly (not by responseCaptured), it might be an error or manual stop
                    // For now, we primarily handle listening stop via responseCaptured or explicit stopListening call
                }
            }
            .store(in: &cancellables)

        speechService.recognizedText
            .removeDuplicates() // Only update if text changes
            .sink { [weak self] text in
                guard let self = self else { return }
                self.recognizedResponse = text
                // Potentially update state to show partial results if desired
                // if case .listeningForResponse(let qText) = self.interviewState {
                //    self.interviewState = .listeningForResponse(questionText: qText, partialResponse: text)
                // }
            }
            .store(in: &cancellables)
            
        speechService.isSpeaking
            .sink { [weak self] isSpeaking in
                guard let self = self else { return }
                if !isSpeaking, case .askingQuestion = self.interviewState {
                    // When speaking finishes, automatically start listening for the response
                    self.startListeningForResponse()
                }
            }
            .store(in: &cancellables)

        speechService.errorSubject
            .sink { [weak self] error in
                guard let self = self else { return }
                AppLogger.error("SpeechService error: \(error.localizedDescription)", tag: "InterviewViewModel")
                self.interviewState = .error(message: error.localizedDescription)
            }
            .store(in: &cancellables)
    }

    func startInterview() {
        guard !questions.isEmpty else {
            interviewState = .error(message: "No questions to ask.")
            return
        }
        
        speechService.requestPermissions { [weak self] micGranted, speechGranted in
            guard let self = self else { return }
            guard micGranted else {
                self.interviewState = .error(message: SpeechServiceError.permissionsNotGranted(type: "Microphone").localizedDescription)
                return
            }
            guard speechGranted else {
                self.interviewState = .error(message: SpeechServiceError.permissionsNotGranted(type: "Speech Recognition").localizedDescription)
                return
            }

            do {
                self.surveyResponse = try self.persistenceService.createSurveyResponse(
                    survey: self.survey,
                    participant: self.participant,
                    interviewDate: Date()
                )
                self.currentQuestionIndex = -1 // Reset index
                self.proceedToNextQuestion()
            } catch {
                self.interviewState = .error(message: "Failed to create survey response: \(error.localizedDescription)")
            }
        }
    }

    func proceedToNextQuestion() {
        currentQuestionIndex += 1
        if let question = questions.get(at: currentQuestionIndex) {
            let questionText = question.text ?? "No question text."
            interviewState = .askingQuestion(questionText: questionText)
            recognizedResponse = "" // Clear previous response
            speechService.speak(text: questionText, language: speechLanguage, rate: speechRate, pitch: speechPitch)
        } else {
            finishInterview()
        }
    }

    func startListeningForResponse() {
        guard let currentQuestion = questions.get(at: currentQuestionIndex) else {
            interviewState = .error(message: "No current question to listen for.")
            return
        }
        let questionText = currentQuestion.text ?? "No question text."
        interviewState = .listeningForResponse(questionText: questionText)
        
        do {
            try speechService.startListening(language: speechLanguage)
        } catch {
            interviewState = .error(message: "Failed to start listening: \(error.localizedDescription)")
        }
    }

    // This method would be called by a UI action or if STT has a "final result" trigger
    // For now, let's assume STT's recognizedText provides the final result when isListening becomes false.
    // We'll need a more robust way to determine finality.
    // A dedicated "Submit Response" button in UI might call this.
    func responseCaptured(finalResponse: String) {
        speechService.stopListening() // Ensure listening is stopped

        guard let currentQuestion = questions.get(at: currentQuestionIndex) else {
            interviewState = .error(message: "No current question to capture response for.")
            return
        }
        let questionText = currentQuestion.text ?? "Error: Missing question text"
        let questionType = currentQuestion.type ?? QuestionType.openEnded.rawValue // Default if not set

        interviewState = .processingResponse(questionText: questionText, responseText: finalResponse)
        
        saveResponse(questionText: questionText, responseText: finalResponse, questionType: questionType)
        
        // After a short delay to show "Processing...", move to next question
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.proceedToNextQuestion()
        }
    }

    private func saveResponse(questionText: String, responseText: String, questionType: String) {
        guard let surveyResponse = self.surveyResponse,
              let questionBeingAnswered = questions.get(at: currentQuestionIndex) else {
            print("Error: SurveyResponse or Question not available for saving.")
            // Potentially update state to reflect save error
            return
        }

        do {
            _ = try persistenceService.addIndividualResponse(
                to: surveyResponse,
                question: questionBeingAnswered, // Pass the actual Question object
                responseText: responseText
            )
            // IndividualResponse's questionText and questionType are set from the Question object
            // by the persistenceService.addIndividualResponse method.
        } catch {
            print("Error saving individual response: \(error.localizedDescription)")
            // Potentially update state to reflect save error
            interviewState = .error(message: "Failed to save response: \(error.localizedDescription)")
        }
    }

    func repeatQuestion() {
        guard speechService.isSpeaking.value == false else {
             print("Cannot repeat question while speech service is speaking.")
             return
        }
        if let question = questions.get(at: currentQuestionIndex) {
            let questionText = question.text ?? "No question text."
            interviewState = .askingQuestion(questionText: questionText) // Update state
            speechService.speak(text: questionText, language: speechLanguage, rate: speechRate, pitch: speechPitch)
        } else {
            interviewState = .error(message: "No question to repeat.")
        }
    }

    func finishInterview() {
        speechService.stopListening()
        speechService.stopSpeaking()
        interviewState = .interviewFinished
        // Any other cleanup or finalization logic
    }
    
    // Helper to determine if user interaction is needed for the current state
    private func shouldRequireUserAction(for state: InterviewState) -> Bool {
        switch state {
        case .listeningForResponse: // e.g., a "Stop Listening & Submit" button might be enabled
            return true
        case .error: // e.g., a "Retry" or "Start Over" button
            return true
        default:
            return false
        }
    }

    // MARK: - Manual Control (if needed from UI)
    // Call this when user explicitly wants to submit the currently recognized response
    func submitCurrentResponse() {
        if case .listeningForResponse = interviewState {
            // Use the latest recognized text as the final response
            let currentFinalResponse = self.recognizedResponse 
            self.responseCaptured(finalResponse: currentFinalResponse)
        } else {
            print("Not in listening state, cannot submit response.")
        }
    }
    
    func skipQuestion() {
        guard case .listeningForResponse = interviewState else {
            print("Can only skip when listening for a response.")
            // Or if you want to allow skipping while the question is being asked:
            // guard case .askingQuestion = interviewState || case .listeningForResponse = interviewState else { ... }
            // if case .askingQuestion = interviewState { speechService.stopSpeaking() }
            return
        }
        speechService.stopListening()
        
        // Save a "skipped" response or specific marker if desired
        // For example:
        // if let currentQuestion = questions.get(at: currentQuestionIndex) {
        //    saveResponse(questionText: currentQuestion.text ?? "", responseText: "[SKIPPED]", questionType: currentQuestion.type ?? "")
        // }

        proceedToNextQuestion()
    }
}
