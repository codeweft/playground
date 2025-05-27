import Foundation
import AVFoundation
import Speech
import Combine

// MARK: - SpeechServiceError Enum
enum SpeechServiceError: Error, LocalizedError {
    case permissionsNotGranted(type: String)
    case speechRecognizerUnavailable
    case audioEngineError(String)
    case recognitionTaskError(String)
    case audioSessionError(String)
    case invalidLanguage(String)
    case synthesizerError(String)

    var errorDescription: String? {
        switch self {
        case .permissionsNotGranted(let type): return "Required \(type) permissions were not granted."
        case .speechRecognizerUnavailable: return "Speech recognizer is not available for the selected language or on this device."
        case .audioEngineError(let message): return "Audio engine error: \(message)"
        case .recognitionTaskError(let message): return "Speech recognition task error: \(message)"
        case .audioSessionError(let message): return "Audio session error: \(message)"
        case .invalidLanguage(let lang): return "Invalid language code: \(lang)."
        case .synthesizerError(let message): return "Speech synthesizer error: \(message)"
        }
    }
}

// MARK: - SpeechServiceProtocol
protocol SpeechServiceProtocol {
    var isListening: CurrentValueSubject<Bool, Never> { get }
    var recognizedText: CurrentValueSubject<String, Never> { get }
    var errorSubject: PassthroughSubject<SpeechServiceError, Never> { get }
    var isSpeaking: CurrentValueSubject<Bool, Never> { get }

    func requestPermissions(completion: @escaping (Bool, Bool) -> Void)
    func speak(text: String, language: String, rate: Float, pitch: Float)
    func stopSpeaking()
    func startListening(language: String) throws
    func stopListening()
}

// MARK: - SpeechService Implementation
class SpeechService: NSObject, SpeechServiceProtocol {

    // Combine Subjects
    let isListening = CurrentValueSubject<Bool, Never>(false)
    let recognizedText = CurrentValueSubject<String, Never>("")
    let errorSubject = PassthroughSubject<SpeechServiceError, Never>()
    let isSpeaking = CurrentValueSubject<Bool, Never>(false)

    // Text-to-Speech (TTS)
    private let speechSynthesizer = AVSpeechSynthesizer()

    // Speech-to-Text (STT)
    private var recognizersCache: [String: SFSpeechRecognizer] = [:]
    private var speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()
    
    private var currentListeningLanguage: String?

    override init() {
        super.init()
        speechSynthesizer.delegate = self
    }

    // MARK: - Permissions
    func requestPermissions(completion: @escaping (Bool, Bool) -> Void) {
        var microphoneGranted = false
        var speechRecognitionGranted = false

        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            microphoneGranted = granted
            SFSpeechRecognizer.requestAuthorization { authStatus in
                speechRecognitionGranted = (authStatus == .authorized)
                DispatchQueue.main.async {
                    completion(microphoneGranted, speechRecognitionGranted)
                }
            }
        }
    }

    // MARK: - Text-to-Speech (TTS)
    func speak(text: String, language: String = "en-US", rate: Float = AVSpeechUtteranceDefaultSpeechRate, pitch: Float = 1.0) {
        if isListening.value {
            print("SpeechService: Stopping listening before speaking.")
            stopListeningInternal() // Stop listening if active
        }
        
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .spokenAudio, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            DispatchQueue.main.async { // Ensure UI updates on main
                self.errorSubject.send(.audioSessionError("Failed to set up audio session for playback: \(error.localizedDescription)"))
            }
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: language)
        utterance.rate = rate
        utterance.pitchMultiplier = pitch
        
        // Check if voice is available
        if utterance.voice == nil {
            DispatchQueue.main.async { // Ensure UI updates on main
                 self.errorSubject.send(.synthesizerError("Voice for language '\(language)' not available."))
            }
            return
        }

        speechSynthesizer.speak(utterance)
        DispatchQueue.main.async { // Ensure UI updates on main for immediate feedback
             self.isSpeaking.send(true)
        }
    }

    func stopSpeaking() {
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
            DispatchQueue.main.async { // Ensure UI updates on main
                self.isSpeaking.send(false) // Delegate method will also set this, but good for immediate feedback
            }
        }
    }

    // MARK: - Speech-to-Text (STT)
    func startListening(language: String = "en-US") throws {
        if speechSynthesizer.isSpeaking {
            print("SpeechService: Stopping speaking before listening.")
            stopSpeaking() // Stop TTS if active
        }
        
        if isListening.value {
            print("SpeechService: Already listening. Stopping current session before starting new one.")
            stopListeningInternal()
        }
        
        currentListeningLanguage = language
        let locale = Locale(identifier: language)

        if let cachedRecognizer = recognizersCache[language] {
            self.speechRecognizer = cachedRecognizer
            // Ensure delegate is still set, though it should be if we set it upon caching
            self.speechRecognizer?.delegate = self 
        } else {
            guard let newRecognizer = SFSpeechRecognizer(locale: locale) else {
                // This case might occur if the locale is invalid from the start
                throw SpeechServiceError.speechRecognizerUnavailable 
                // Or perhaps a more specific error like .invalidLanguage if SFSpeechRecognizer init with bad locale returns nil
            }
            newRecognizer.delegate = self
            recognizersCache[language] = newRecognizer
            self.speechRecognizer = newRecognizer
        }

        guard let recognizer = self.speechRecognizer, recognizer.isAvailable else {
            recognizersCache[language] = nil // Remove if it became unavailable or was never available
            self.speechRecognizer = nil
            throw SpeechServiceError.speechRecognizerUnavailable
        }
        // recognizer.delegate is already set (either from cache or new)

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            throw SpeechServiceError.audioSessionError("Failed to set up audio session for recording: \(error.localizedDescription)")
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            // This should not happen if initialization is correct
            throw SpeechServiceError.recognitionTaskError("SFSpeechAudioBufferRecognitionRequest could not be created.")
        }
        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }
            var isFinal = false

            if let result = result {
                let recognizedString = result.bestTranscription.formattedString
                DispatchQueue.main.async { // Ensure UI updates on main
                    self.recognizedText.send(recognizedString)
                }
                isFinal = result.isFinal
            }

            if error != nil || isFinal {
                // stopListeningInternal already handles isListening.send(false)
                // and that should be on main if called from here.
                // Let's ensure stopListeningInternal itself dispatches its isListening.send(false) to main.
                self.stopListeningInternal() 
                if let error = error {
                    DispatchQueue.main.async { // Ensure UI updates on main
                        self.errorSubject.send(.recognitionTaskError(error.localizedDescription))
                    }
                }
            }
        }

        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            DispatchQueue.main.async { // Ensure UI updates on main
                self.isListening.send(true)
                self.recognizedText.send("") // Clear previous text
            }
        } catch {
            stopListeningInternal() // Clean up on error
            throw SpeechServiceError.audioEngineError("Could not start audio engine: \(error.localizedDescription)")
        }
    }

    func stopListening() {
        stopListeningInternal()
    }

    private func stopListeningInternal() {
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio() // Tell the request no more audio is coming
        recognitionTask?.cancel()     // Cancel the task

        recognitionRequest = nil
        recognitionTask = nil
        // speechRecognizer = nil // Keep recognizer instance for potential reuse, but delegate might re-evaluate availability
        
        if isListening.value { // Only deactivate session if we were actually listening
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                DispatchQueue.main.async { // Ensure UI updates on main
                    self.errorSubject.send(.audioSessionError("Failed to deactivate audio session: \(error.localizedDescription)"))
                }
            }
        }
        DispatchQueue.main.async { // Ensure UI updates on main
            self.isListening.send(false)
        }
    }
}

// MARK: - AVSpeechSynthesizerDelegate
extension SpeechService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.isSpeaking.send(true) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.isSpeaking.send(false) }
        // Deactivate audio session if it was set for playback only by this service
        // and not currently listening (which would require the session for recording).
        DispatchQueue.main.async { // Wrap check and potential error in main queue
            if !self.isListening.value {
                do {
                    try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                } catch {
                    self.errorSubject.send(.audioSessionError("Failed to deactivate audio session post-synthesis: \(error.localizedDescription)"))
                }
            }
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        // Example: DispatchQueue.main.async { self.isSpeaking.send(false) } // Or a different state like .paused
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        // Example: DispatchQueue.main.async { self.isSpeaking.send(true) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.isSpeaking.send(false) }
        // Deactivate audio session similar to didFinish
        DispatchQueue.main.async { // Wrap check and potential error in main queue
            if !self.isListening.value {
                do {
                    try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                } catch {
                    self.errorSubject.send(.audioSessionError("Failed to deactivate audio session post-cancellation: \(error.localizedDescription)"))
                }
            }
        }
    }
    
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
        // Can be used for highlighting spoken text
    }
}

// MARK: - SFSpeechRecognizerDelegate
extension SpeechService: SFSpeechRecognizerDelegate {
    func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        if !available {
            // currentListeningLanguage should be accessed on main if it's modified on main,
            // or self should be captured on main. For safety:
            DispatchQueue.main.async {
                if self.isListening.value && speechRecognizer.locale.identifier == self.currentListeningLanguage {
                    self.stopListeningInternal() // This will now dispatch its isListening.send to main
                    self.errorSubject.send(.speechRecognizerUnavailable) // errorSubject should also be sent from main
                }
            }
        }
    }
}

/*
 Developer Reminder for Info.plist:

 To use speech recognition and microphone access, ensure the following keys are present in your app's Info.plist file:

 1. Privacy - Speech Recognition Usage Description (NSSpeechRecognitionUsageDescription)
    Example Value: "This app uses speech recognition to convert your voice into text for survey responses."

 2. Privacy - Microphone Usage Description (NSMicrophoneUsageDescription)
    Example Value: "This app needs microphone access to record your voice for survey responses."

 Failure to include these descriptions will result in the app crashing when attempting to request these permissions.
*/
