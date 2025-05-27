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
            errorSubject.send(.audioSessionError("Failed to set up audio session for playback: \(error.localizedDescription)"))
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: language)
        utterance.rate = rate
        utterance.pitchMultiplier = pitch
        
        // Check if voice is available
        if utterance.voice == nil {
             errorSubject.send(.synthesizerError("Voice for language '\(language)' not available."))
             return
        }

        speechSynthesizer.speak(utterance)
        isSpeaking.send(true)
    }

    func stopSpeaking() {
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
            isSpeaking.send(false) // Delegate method will also set this, but good for immediate feedback
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
        guard let locale = Locale(identifier: language) else {
            throw SpeechServiceError.invalidLanguage(language)
        }
        speechRecognizer = SFSpeechRecognizer(locale: locale)

        guard let recognizer = speechRecognizer, recognizer.isAvailable else {
            speechRecognizer = nil // Clear it if not available
            throw SpeechServiceError.speechRecognizerUnavailable
        }
        recognizer.delegate = self // Set delegate for availability changes

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
                self.recognizedText.send(result.bestTranscription.formattedString)
                isFinal = result.isFinal
            }

            if error != nil || isFinal {
                self.stopListeningInternal() // Clean up resources
                if let error = error {
                    self.errorSubject.send(.recognitionTaskError(error.localizedDescription))
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
            isListening.send(true)
            recognizedText.send("") // Clear previous text
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
                errorSubject.send(.audioSessionError("Failed to deactivate audio session: \(error.localizedDescription)"))
            }
        }
        isListening.send(false)
    }
}

// MARK: - AVSpeechSynthesizerDelegate
extension SpeechService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        isSpeaking.send(true)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        isSpeaking.send(false)
        // Deactivate audio session if it was set for playback only by this service
        do {
            // Check if still listening, if so, don't deactivate playback session yet
            if !isListening.value {
                 try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            errorSubject.send(.audioSessionError("Failed to deactivate audio session post-synthesis: \(error.localizedDescription)"))
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        // isSpeaking.send(false) // Or a different state like .paused
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        // isSpeaking.send(true)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        isSpeaking.send(false)
        // Deactivate audio session similar to didFinish
        do {
             if !isListening.value {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
             }
        } catch {
            errorSubject.send(.audioSessionError("Failed to deactivate audio session post-cancellation: \(error.localizedDescription)"))
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
            if isListening.value && speechRecognizer.locale.identifier == currentListeningLanguage {
                // If currently listening with this recognizer and it becomes unavailable
                stopListeningInternal()
                errorSubject.send(.speechRecognizerUnavailable)
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
