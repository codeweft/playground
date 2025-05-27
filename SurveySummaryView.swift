import SwiftUI
import CoreData

struct SurveySummaryView: View {
    @StateObject var viewModel: SurveySummaryViewModel
    @Environment(\.dismiss) var dismiss
    
    @State private var showShareSheet = false
    @State private var activityItems: [Any] = []
    @State private var shareError: String? = nil // To display errors from file creation/sharing

    // Initializer to inject dependencies into the ViewModel
    init(moc: NSManagedObjectContext, survey: Survey, participant: Participant) {
        _viewModel = StateObject(wrappedValue: SurveySummaryViewModel(
            moc: moc,
            survey: survey,
            participant: participant
        ))
    }

    var body: some View {
        NavigationView { // Or Group if already in a NavigationView
            VStack(alignment: .leading, spacing: 0) {
                // Header Information
                VStack(alignment: .leading, spacing: 8) {
                    Text("Survey: \(viewModel.surveyTitle)")
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("Participant: \(viewModel.participantName)")
                        .font(.headline)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(UIColor.systemGroupedBackground)) // Subtle background for header

                Divider()

                // List of Responses
                if viewModel.responses.isEmpty {
                    Spacer()
                    Text("No responses found for this participant in this survey.")
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .padding()
                    Spacer()
                } else {
                    List {
                        ForEach(viewModel.responses) { responseData in
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Q\(responseData.questionOrder + 1): \(responseData.questionText)")
                                    .fontWeight(.semibold)
                                Text("A: \(responseData.responseText)")
                                    .foregroundColor(.gray)
                            }
                            .padding(.vertical, 5)
                        }
                    }
                }
                
                // Error display for sharing issues
                if let error = shareError {
                    Text("Error preparing for sharing: \(error)")
                        .foregroundColor(.red)
                        .font(.caption)
                        .padding()
                }
            }
            .navigationTitle("Survey Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button("Export as CSV") {
                            prepareAndShare(format: .csv)
                        }
                        Button("Export as JSON") {
                            prepareAndShare(format: .json)
                        }
                        Button("Export Both") {
                            prepareAndShare(format: .both)
                        }
                    } label: {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                }
            }
            .sheet(isPresented: $showShareSheet) {
                ActivityViewControllerWrapper(activityItems: activityItems)
            }
            // .onAppear {
            //     viewModel.fetchResponses() // Data is fetched in ViewModel's init
            // }
        }
    }
    
    private enum ExportFormat {
        case csv, json, both
    }

    private func prepareAndShare(format: ExportFormat) {
        var itemsToShare: [URL] = []
        self.shareError = nil // Clear previous errors

        let cacheDirectory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
        guard let cacheDir = cacheDirectory else {
            self.shareError = "Could not access cache directory."
            return
        }
        
        let surveyTitleSanitized = viewModel.surveyTitle.replacingOccurrences(of: "[^a-zA-Z0-9_]", with: "_", options: .regularExpression)
        let participantNameSanitized = viewModel.participantName.replacingOccurrences(of: "[^a-zA-Z0-9_]", with: "_", options: .regularExpression)
        let baseFilename = "Survey_\(surveyTitleSanitized)_Participant_\(participantNameSanitized)"

        if format == .csv || format == .both {
            let csvData = viewModel.generateCSV().data(using: .utf8)
            let csvFilename = "\(baseFilename).csv"
            let csvURL = cacheDir.appendingPathComponent(csvFilename)
            do {
                try csvData?.write(to: csvURL, options: .atomicWrite)
                itemsToShare.append(csvURL)
            } catch {
                self.shareError = "Failed to create CSV file: \(error.localizedDescription)"
                // If only CSV fails in .both case, we might still want to share JSON
                if format == .csv { return }
            }
        }

        if format == .json || format == .both {
            let jsonData = viewModel.generateJSON().data(using: .utf8)
            let jsonFilename = "\(baseFilename).json"
            let jsonURL = cacheDir.appendingPathComponent(jsonFilename)
            do {
                try jsonData?.write(to: jsonURL, options: .atomicWrite)
                itemsToShare.append(jsonURL)
            } catch {
                self.shareError = (self.shareError ?? "") + "\nFailed to create JSON file: \(error.localizedDescription)"
                if format == .json { return }
            }
        }
        
        if !itemsToShare.isEmpty {
            self.activityItems = itemsToShare
            self.showShareSheet = true
        } else if self.shareError == nil { // No items and no error means something unexpected happened
            self.shareError = "No data available to share or unknown error."
        }
    }
}

// MARK: - Preview
struct SurveySummaryView_Previews: PreviewProvider {
    static var previews: some View {
        // Create mock/preview instances
        let moc = PersistenceController.preview.container.viewContext
        
        let sampleSurvey = Survey(context: moc)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Customer Satisfaction"
        sampleSurvey.createdAt = Date()

        let question1 = Question(context: moc)
        question1.id = UUID()
        question1.text = "How satisfied are you with our service?"
        question1.questionType = "openEnded"
        question1.order = 0
        sampleSurvey.addToQuestions(question1)

        let question2 = Question(context: moc)
        question2.id = UUID()
        question2.text = "Would you recommend us to a friend?"
        question2.questionType = "multipleChoice"
        question2.options = "Yes,No,Maybe"
        question2.order = 1
        sampleSurvey.addToQuestions(question2)
        
        let sampleParticipant = Participant(context: moc)
        sampleParticipant.id = UUID()
        sampleParticipant.name = "Alex Appleseed"
        sampleParticipant.createdAt = Date()

        // Create sample responses
        let response1 = Response(context: moc)
        response1.id = UUID()
        response1.responseText = "Very satisfied!"
        response1.recordedAt = Date()
        response1.question = question1
        response1.survey = sampleSurvey
        response1.participant = sampleParticipant
        
        let response2 = Response(context: moc)
        response2.id = UUID()
        response2.responseText = "Yes"
        response2.recordedAt = Date()
        response2.question = question2
        response2.survey = sampleSurvey
        response2.participant = sampleParticipant

        do {
            try moc.save()
        } catch {
            print("Preview save error: \(error)")
        }

        return SurveySummaryView(
            moc: moc,
            survey: sampleSurvey,
            participant: sampleParticipant
        )
    }
}
