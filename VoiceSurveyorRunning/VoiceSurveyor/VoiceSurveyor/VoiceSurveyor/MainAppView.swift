import SwiftUI

struct MainAppView: View {
    @Environment(\.managedObjectContext) private var viewContext
    
    // Initialize persistence service once, if needed by child views directly,
    // or they can initialize their own with the viewContext.
    // For AllSurveysResultsOverviewView's SurveyListViewModel, it will initialize its own.
    // For SurveyListView and ParticipantListView, they also initialize their own ViewModels
    // which in turn initialize their own PersistenceService with the viewContext.

    var body: some View {
        TabView {
            // First Tab: Surveys
            SurveyListView() // ViewModel inside will use viewContext
                .tabItem {
                    Label("Surveys", systemImage: "list.bullet.rectangle.portrait")
                }
                .accessibilityIdentifier("SurveysTab")

            // Second Tab: Participants
            ParticipantListView() // ViewModel inside will use viewContext
                .tabItem {
                    Label("Participants", systemImage: "person.3.fill")
                }
                .accessibilityIdentifier("ParticipantsTab")

            // Third Tab: Results
            AllSurveysResultsOverviewView() // ViewModel inside will use viewContext
                .tabItem {
                    Label("Results", systemImage: "chart.bar.xaxis")
                }
                .accessibilityIdentifier("ResultsTab")
        }
    }
}

// Define AllSurveysResultsOverviewView within the same file or separately.
// For this task, defining it here is fine.
struct AllSurveysResultsOverviewView: View {
    @StateObject private var surveyListVM: SurveyListViewModel
    @Environment(\.managedObjectContext) private var viewContext

    // To allow previewing with a specific service, or default initialization
    init(persistenceService: PersistenceServiceProtocol? = nil) {
        if let service = persistenceService {
            _surveyListVM = StateObject(wrappedValue: SurveyListViewModel(persistenceService: service))
        } else {
            // This will be the typical path when used in MainAppView
            // It relies on viewContext being available in the environment.
            // We need to ensure PersistenceService can be initialized with just a context if needed,
            // or SurveyListViewModel handles this.
            // SurveyListViewModel's default initializer creates a PersistenceService.
            // Let's ensure it can use the environment's viewContext.
            // For simplicity, we can pass the context directly if SurveyListViewModel supports it,
            // or ensure SurveyListViewModel's default PersistenceService() correctly uses the shared/environment context.
            // The current SurveyListViewModel default init `PersistenceService()` should use `PersistenceController.shared.container.viewContext`.
            _surveyListVM = StateObject(wrappedValue: SurveyListViewModel())
        }
    }


    var body: some View {
        NavigationView {
            List {
                if surveyListVM.surveys.isEmpty {
                    Text("No surveys found. Create some surveys first.")
                        .foregroundColor(.gray)
                        .padding()
                } else {
                    ForEach(surveyListVM.surveys) { survey in
                        NavigationLink(destination: SurveyResultsView(survey: survey).environment(\.managedObjectContext, viewContext)) {
                            VStack(alignment: .leading) {
                                Text(survey.title ?? "Untitled Survey")
                                    .font(.headline)
                                Text("Created: \(survey.createdAt ?? Date(), formatter: itemFormatter)")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                // You could also display number of responses if that data is easily available here
                                // For example, by adding a transient property to Survey or fetching it.
                                // Text("Responses: \(survey.surveyResponses?.count ?? 0)")
                                //    .font(.caption)
                            }
                        }
                    }
                }
            }
            .navigationTitle("All Survey Results")
            .onAppear {
                surveyListVM.fetchSurveys()
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        surveyListVM.fetchSurveys()
                    } label: {
                        Label("Refresh Surveys", systemImage: "arrow.clockwise")
                    }
                }
            }
        }
    }
}

private let itemFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .short
    formatter.timeStyle = .none
    return formatter
}()

struct MainAppView_Previews: PreviewProvider {
    static var previews: some View {
        // Use the preview context from PersistenceController
        let previewPersistenceController = PersistenceController.preview
        
        // Example: Add a sample survey to the preview context so AllSurveysResultsOverviewView has something to show
        let previewService = PersistenceService(context: previewPersistenceController.container.viewContext)
        _ = try? previewService.createSurvey(title: "Sample Survey for Results Preview")
        // Add more sample data as needed for other tabs to preview correctly

        return MainAppView()
            .environment(\.managedObjectContext, previewPersistenceController.container.viewContext)
    }
}
