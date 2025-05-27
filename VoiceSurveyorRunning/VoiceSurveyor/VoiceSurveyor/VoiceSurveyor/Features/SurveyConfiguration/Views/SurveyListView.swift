import SwiftUI

struct SurveyListView: View {
    @StateObject private var viewModel: SurveyListViewModel
    @State private var showingSurveyEditor = false
    @State private var surveyToEdit: Survey? = nil // For editing existing surveys

    // Environment variable to access the managed object context
    @Environment(\.managedObjectContext) private var viewContext

    init(persistenceService: PersistenceServiceProtocol? = nil) {
        // If a persistence service is passed, use it. Otherwise, create a new one with the viewContext.
        // This allows for easier previewing and testing.
        if let service = persistenceService {
            _viewModel = StateObject(wrappedValue: SurveyListViewModel(persistenceService: service))
        } else {
            // Ensure this matches how PersistenceService is typically initialized in your app
            _viewModel = StateObject(wrappedValue: SurveyListViewModel(persistenceService: PersistenceService(context: PersistenceController.shared.container.viewContext)))
        }
    }
    
    // Convenience for passing to SurveyEditorView
    private var persistenceServiceForEditor: PersistenceServiceProtocol {
        // This assumes SurveyListViewModel has a public persistenceService property or a way to get it.
        // If not, you might need to adjust how you pass the service or context.
        // For simplicity, we'll re-create one if it's not directly accessible.
        // This is not ideal and should be refined based on actual ViewModel implementation.
        // A better way: viewModel.persistenceService (if public)
        return PersistenceService(context: viewContext) 
    }


    var body: some View {
        NavigationView {
            List {
                ForEach(viewModel.surveys) { survey in
                    Button(action: {
                        self.surveyToEdit = survey
                        self.showingSurveyEditor = true
                    }) {
                        VStack(alignment: .leading) {
                            Text(survey.title ?? "Untitled Survey")
                                .font(.headline)
                            Text("Questions: \(survey.questions?.count ?? 0)")
                                .font(.subheadline)
                            Text("Created: \(survey.createdAt ?? Date(), formatter: itemFormatter)")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                }
                .onDelete(perform: viewModel.deleteSurvey)
            }
            .navigationTitle("Surveys")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        self.surveyToEdit = nil // Ensure we're creating a new survey
                        self.showingSurveyEditor = true
                    } label: {
                        Label("New Survey", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingSurveyEditor, onDismiss: {
                viewModel.fetchSurveys() // Refresh list when editor is dismissed
            }) {
                // Pass the existing survey if editing, or nil for new
                // Also pass the persistence service
                if let surveyToEdit = self.surveyToEdit {
                    SurveyEditorView(viewModel: SurveyEditorViewModel(survey: surveyToEdit, persistenceService: persistenceServiceForEditor))
                } else {
                    SurveyEditorView(viewModel: SurveyEditorViewModel(persistenceService: persistenceServiceForEditor))
                }
            }
            .onAppear {
                viewModel.fetchSurveys()
            }
        }
    }
}

private let itemFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .short
    formatter.timeStyle = .medium
    return formatter
}()

struct SurveyListView_Previews: PreviewProvider {
    static var previews: some View {
        // Use the preview context from PersistenceController
        let previewPersistenceController = PersistenceController.preview
        let previewService = PersistenceService(context: previewPersistenceController.container.viewContext)
        
        // Ensure there's some data for the preview
        // The PersistenceController.preview already creates sample data.
        // If you need more specific data for SurveyListView, you can add it here.
        // For example, create a few surveys if they aren't already in the preview data.
        // let sampleSurvey = try? previewService.createSurvey(title: "Preview Survey 1")
        // let sampleSurvey2 = try? previewService.createSurvey(title: "Preview Survey 2")
        // ... add questions to them if needed for display ...

        return SurveyListView(persistenceService: previewService)
            .environment(\.managedObjectContext, previewPersistenceController.container.viewContext)
    }
}
