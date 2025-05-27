import AVFoundation
import Speech
import Combine // For ObservableObject, though not strictly needed if only @Published is used from Foundation

class SpeechService: NSObject, ObservableObject, SFSpeechRecognizerDelegate, AVSpeechSynthesizerDelegate {

    // MARK: - Properties
    private let speechSynthesizer = AVSpeechSynthesizer()
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) // Ensure this locale is supported
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    @Published var recognizedText: String = ""
    @Published var isRecording: Bool = false
    @Published var isSpeaking: Bool = false
    @Published var speechError: String? = nil
    @Published var sttAvailability: Bool = false // For SFSpeechRecognizer availability
    @Published var permissionStatusSpeech: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    @Published var permissionStatusMicrophone: AVAudioSession.RecordPermission = .undetermined


    // MARK: - Initialization
    override init() {
        super.init()
        speechSynthesizer.delegate = self
        speechRecognizer?.delegate = self // speechRecognizer can be nil if the locale isn't supported or STT isn't available
        
        // Check initial availability
        self.sttAvailability = speechRecognizer?.isAvailable ?? false
        
        requestPermissions()
    }

    // MARK: - Permission Management
    func requestPermissions() {
        SFSpeechRecognizer.requestAuthorization { [weak self] authStatus in
            DispatchQueue.main.async {
                self?.permissionStatusSpeech = authStatus
                switch authStatus {
                case .authorized:
                    self?.speechError = nil
                case .denied:
                    self?.speechError = "Speech recognition permission denied by user."
                case .restricted:
                    self?.speechError = "Speech recognition restricted on this device."
                case .notDetermined:
                    self?.speechError = "Speech recognition permission not yet determined."
                @unknown default:
                    self?.speechError = "Unknown speech recognition authorization status."
                }
            }
        }

        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                self?.permissionStatusMicrophone = AVAudioSession.sharedInstance().recordPermission
                if !granted {
                    self?.speechError = (self?.speechError ?? "") + "\nMicrophone access permission denied."
                }
            }
        }
    }

    // MARK: - Text-to-Speech (TTS)
    func speak(text: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            self.speechError = "Cannot speak empty text."
            return
        }
        
        if isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate) // Stop current speech if any
        }

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .voicePrompt, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            self.speechError = "Failed to configure audio session for playback: \(error.localizedDescription)"
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US") // Or use user's current locale if desired
        // utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        // utterance.pitchMultiplier = 1.0
        
        speechSynthesizer.speak(utterance)
        // isSpeaking will be set to true by the delegate method didStart
    }

    // MARK: - AVSpeechSynthesizerDelegate Methods
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = true
            self.speechError = nil
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
        }
        // Deactivate audio session
        do {
            try AVAudioSession.sharedInstance().setActive(false, with: .notifyOthersOnDeactivation)
        } catch {
            DispatchQueue.main.async {
                 // Avoid overwriting a more critical error if one occurred during speech itself
                if self.speechError == nil {
                    self.speechError = "Failed to deactivate audio session: \(error.localizedDescription)"
                }
            }
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
        }
        do {
            try AVAudioSession.sharedInstance().setActive(false, with: .notifyOthersOnDeactivation)
        } catch {
             DispatchQueue.main.async {
                if self.speechError == nil {
                    self.speechError = "Failed to deactivate audio session after cancel: \(error.localizedDescription)"
                }
            }
        }
    }
    
    // MARK: - Speech-to-Text (STT)
    func startRecording() {
        guard speechRecognizer?.isAvailable ?? false else {
            self.speechError = "Speech recognizer is not available. Please check permissions and device support."
            return
        }
        
        guard !isRecording else {
            // print("Already recording.") // Or handle as an error/warning
            return
        }

        if recognitionTask != nil {
            recognitionTask?.cancel()
            recognitionTask = nil
        }

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            self.speechError = "Failed to configure audio session for recording: \(error.localizedDescription)"
            self.isRecording = false // Ensure state is correct
            return
        }

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            // This should ideally not happen if object creation is straightforward.
            self.speechError = "Unable to create SFSpeechAudioBufferRecognitionRequest."
            // Deactivate audio session if it was activated
            try? AVAudioSession.sharedInstance().setActive(false, with: .notifyOthersOnDeactivation)
            return
        }
        recognitionRequest.shouldReportPartialResults = true

        // Check if speechRecognizer is available (it's optional)
        guard let recognizer = speechRecognizer else {
            self.speechError = "Speech recognizer is not initialized."
            try? AVAudioSession.sharedInstance().setActive(false, with: .notifyOthersOnDeactivation)
            return
        }

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }
            var isFinal = false

            DispatchQueue.main.async {
                if let result = result {
                    self.recognizedText = result.bestTranscription.formattedString
                    isFinal = result.isFinal
                }

                if error != nil || isFinal {
                    if let error = error {
                         // Filter out "Error Domain=kAFAssistantErrorDomain Code=203" (No speech) which can be common
                        let nsError = error as NSError
                        if !(nsError.domain == "kAFAssistantErrorDomain" && nsError.code == 203) {
                             self.speechError = "Recognition Error: \(error.localizedDescription)"
                        } else if self.recognizedText.isEmpty && isFinal {
                            // If no speech was detected and it's final, clear any previous error not related to this.
                            // Or set a specific message like "No speech detected."
                            // self.speechError = "No speech detected."
                        }
                    }
                    // This will also stop the audio engine and clean up resources
                    self.stopRecordingInternal(deactivateAudioSession: true)
                }
            }
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        
        // Ensure there's no existing tap.
        inputNode.removeTap(onBus: 0) // Call before installing a new one to be safe
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()

        do {
            try audioEngine.start()
            DispatchQueue.main.async {
                self.recognizedText = "" // Clear previous text
                self.isRecording = true
                self.speechError = nil
            }
        } catch {
            DispatchQueue.main.async {
                self.speechError = "Audio engine failed to start: \(error.localizedDescription)"
                self.isRecording = false
            }
            // Clean up if audio engine fails to start
            self.stopRecordingInternal(deactivateAudioSession: true)
        }
    }

    func stopRecording() {
        // Public method to stop recording, ensures audio session is deactivated.
        stopRecordingInternal(deactivateAudioSession: true)
    }
    
    private func stopRecordingInternal(deactivateAudioSession: Bool) {
        // Check if it's actually recording or if resources are active
        // Guard against multiple calls or calls when not active
        guard audioEngine.isRunning || recognitionRequest != nil || recognitionTask != nil || isRecording else {
            // print("stopRecordingInternal called but nothing seems active.")
            // Ensure isRecording is false if other states are already nil/stopped
            if isRecording {
                DispatchQueue.main.async { self.isRecording = false }
            }
            return
        }

        DispatchQueue.main.async { // Update published properties on main thread
             self.isRecording = false // Set this early so UI can react
        }
        
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        
        recognitionRequest?.endAudio() // Crucial to finalize recognition
        recognitionRequest = nil
        
        // recognitionTask?.cancel() // Use cancel if you want to stop immediately without processing remaining audio
        recognitionTask?.finish() // Use finish if you want the recognizer to attempt to process any buffered audio
        recognitionTask = nil

        if deactivateAudioSession {
            do {
                try AVAudioSession.sharedInstance().setActive(false, with: .notifyOthersOnDeactivation)
            } catch {
                DispatchQueue.main.async {
                    // Avoid overwriting a more critical error
                    if self.speechError == nil {
                         self.speechError = "Failed to deactivate audio session on stop: \(error.localizedDescription)"
                    }
                }
            }
        }
    }

    // MARK: - SFSpeechRecognizerDelegate Methods
    func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        DispatchQueue.main.async {
            self.sttAvailability = available
            if !available {
                self.speechError = "Speech recognition service is currently unavailable."
                if self.isRecording { // If it becomes unavailable during recording
                    self.stopRecordingInternal(deactivateAudioSession: true)
                }
            } else {
                // If it becomes available and there was an availability error, clear it.
                if self.speechError == "Speech recognition service is currently unavailable." {
                    self.speechError = nil
                }
            }
        }
    }
}
