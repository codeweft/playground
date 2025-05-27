import SwiftUI

// MARK: - ShareableDocument Helper
struct ShareableDocument: Identifiable {
    let id = UUID() // Conformance to Identifiable
    var url: URL
    var mimeType: String // e.g., "text/csv", "application/json"
}

// MARK: - ShareSheet Helper
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    let applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: activityItems, applicationActivities: applicationActivities)
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {
        // Nothing to update here
    }
}

enum ExportType {
    case csv, json
}

// MARK: - SurveyResultsView
struct SurveyResultsView: View {
    @StateObject var viewModel: SurveyResultsViewModel
    
    @State private var documentToShare: ShareableDocument? = nil
    @State private var showingExportErrorAlert = false
    @State private var exportErrorMessage = ""

    // Environment variable to access the managed object context for PersistenceService
    @Environment(\.managedObjectContext) private var viewContext

    init(survey: Survey, persistenceService: PersistenceServiceProtocol? = nil) {
        // If a persistence service is passed, use it. Otherwise, create a new one with the viewContext.
        let service = persistenceService ?? PersistenceService(context: PersistenceController.shared.container.viewContext)
        _viewModel = StateObject(wrappedValue: SurveyResultsViewModel(survey: survey, persistenceService: service))
    }

    var body: some View {
        VStack {
            Text(viewModel.survey.title ?? "Survey Results")
                .font(.title2)
                .padding(.bottom)

            if viewModel.isLoading {
                ProgressView("Loading results...")
                    .padding()
            } else if let errorMessage = viewModel.errorMessage {
                Text("Error: \(errorMessage)")
                    .foregroundColor(.red)
                    .padding()
            } else if viewModel.surveyResponses.isEmpty {
                Text("No responses found for this survey.")
                    .foregroundColor(.gray)
                    .padding()
            } else {
                List {
                    ForEach(viewModel.surveyResponses) { responseSet in
                        NavigationLink(destination: ResponseDetailView(responseSet: responseSet)) {
                            VStack(alignment: .leading) {
                                Text(responseSet.participantName)
                                    .font(.headline)
                                Text("Date: \(responseSet.interviewDate, formatter: itemFormatter)")
                                    .font(.subheadline)
                                Text("Responses: \(responseSet.responses.count)")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Results")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack {
                    Button {
                        exportData(type: .csv)
                    } label: {
                        Label("Export CSV", systemImage: "square.and.arrow.down.on.square")
                    }
                    .accessibilityIdentifier("ExportCSVButton")

                    Button {
                        exportData(type: .json)
                    } label: {
                        Label("Export JSON", systemImage: "doc.text.fill")
                    }
                    .accessibilityIdentifier("ExportJSONButton")
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                Button {
                    viewModel.fetchResults()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .accessibilityIdentifier("RefreshResultsButton")
            }
        }
        .sheet(item: $documentToShare) { document in
            ShareSheet(activityItems: [document.url])
        }
        .alert("Export Error", isPresented: $showingExportErrorAlert, actions: {
            Button("OK", role: .cancel) { }
        }, message: {
            Text(exportErrorMessage)
        })
        .onAppear {
            // Initial fetch if needed, though ViewModel fetches on init
            // viewModel.fetchResults()
        }
    }

    // MARK: - Export Logic
    private func exportData(type: ExportType) {
        let result: Result<Data, Error>
        let fileName: String
        let mimeType: String

        switch type {
        case .csv:
            result = viewModel.generateCSVData()
            fileName = "\(viewModel.survey.title ?? "Survey")_Results.csv"
            mimeType = "text/csv"
        case .json:
            result = viewModel.generateJSONData()
            fileName = "\(viewModel.survey.title ?? "Survey")_Results.json"
            mimeType = "application/json"
        }

        switch result {
        case .success(let data):
            if let fileURL = saveDataToTemporaryFile(data: data, fileName: fileName) {
                documentToShare = ShareableDocument(url: fileURL, mimeType: mimeType)
            } else {
                exportErrorMessage = "Could not save data to a temporary file."
                showingExportErrorAlert = true
            }
        case .failure(let error):
            if let exportError = error as? ExportError {
                exportErrorMessage = exportError.localizedDescription
            } else {
                exportErrorMessage = "An unknown error occurred during export: \(error.localizedDescription)"
            }
            showingExportErrorAlert = true
        }
    }

    private func saveDataToTemporaryFile(data: Data, fileName: String) -> URL? {
        let temporaryDirectoryURL = FileManager.default.temporaryDirectory
        let fileURL = temporaryDirectoryURL.appendingPathComponent(fileName)

        do {
            try data.write(to: fileURL, options: .atomic)
            return fileURL
        } catch {
            print("Error saving data to temporary file: \(error)")
            exportErrorMessage = "Failed to write data to temporary file: \(error.localizedDescription)"
            // showingExportErrorAlert is typically set by the caller if this returns nil
            return nil
        }
    }
}

private let itemFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter
}()


// MARK: - Preview
struct SurveyResultsView_Previews: PreviewProvider {
    static var previews: some View {
        let previewContext = PersistenceController.preview.container.viewContext
        let previewPersistenceService = PersistenceService(context: previewContext)

        // Create sample Survey for Preview
        let sampleSurvey = Survey(context: previewContext)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Preview Survey Results"
        sampleSurvey.createdAt = Date()

        // Create sample Participant for Preview
        let sampleParticipant = Participant(context: previewContext)
        sampleParticipant.id = UUID()
        sampleParticipant.name = "Jane Doe (Preview)"

        // Create sample SurveyResponse for Preview
        let surveyResponse = SurveyResponse(context: previewContext)
        surveyResponse.id = UUID()
        surveyResponse.interviewDate = Date()
        surveyResponse.participant = sampleParticipant
        surveyResponse.survey = sampleSurvey

        // Create sample IndividualResponse for Preview
        let ir1 = IndividualResponse(context: previewContext)
        ir1.id = UUID(); ir1.questionText = "Q1: Favorite color?"; ir1.responseText = "Blue"; ir1.questionType = "Open Ended"
        ir1.surveyResponse = surveyResponse
        
        let ir2 = IndividualResponse(context: previewContext)
        ir2.id = UUID(); ir2.questionText = "Q2: Enjoyed experience?"; ir2.responseText = "Yes"; ir2.questionType = "Single Choice"
        ir2.surveyResponse = surveyResponse
        
        surveyResponse.addToIndividualResponses(NSSet(array: [ir1, ir2]))

        do {
            try previewContext.save()
        } catch {
            print("Error saving preview context for SurveyResultsView: \(error)")
        }
        
        // The SurveyResultsViewModel will fetch these when initialized.
        // We pass a PersistenceService instance that uses the preview context.

        return NavigationView { // NavigationView for title and toolbar
            SurveyResultsView(survey: sampleSurvey, persistenceService: previewPersistenceService)
        }
    }
}
