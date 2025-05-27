import SwiftUI
import CoreData

struct SurveyListView: View {
    @Environment(\.managedObjectContext) private var moc
    @StateObject private var surveyListViewModel: SurveyListViewModel

    @State private var showingAddSurveySheet = false
    @State private var surveyToEdit: Survey? = nil // Used to trigger the edit sheet

    init() {
        // Initialize _surveyListViewModel directly using the environment's moc
        // This requires obtaining moc in a way that's available during init.
        // A common pattern is to pass it if direct environment access is tricky here,
        // or initialize it in onAppear if the ViewModel doesn't need moc immediately at init.
        // For this setup, we assume moc will be available when the view body is accessed.
        // A more robust way for @StateObject is to inject the moc into the ViewModel's initializer.
        // Let's adjust SurveyListViewModel to accept moc in init and initialize it here.
        // This was already specified in the prompt for SurveyListViewModel.
        let context = PersistenceController.shared.container.viewContext // Or however moc is accessed
        _surveyListViewModel = StateObject(wrappedValue: SurveyListViewModel(moc: context))
    }
    
    // Alternative init if moc needs to be explicitly passed (e.g. from a parent view or App struct)
    // init(moc: NSManagedObjectContext) {
    //     _surveyListViewModel = StateObject(wrappedValue: SurveyListViewModel(moc: moc))
    // }


    var body: some View {
        NavigationView {
            List {
                ForEach(surveyListViewModel.surveys) { survey in
                    Button(action: {
                        self.surveyToEdit = survey // Set surveyToEdit to trigger the sheet
                    }) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(survey.title ?? "Untitled Survey")
                                    .font(.headline)
                                Text(survey.surveyDescription ?? "No description")
                                    .font(.subheadline)
                                    .foregroundColor(.gray)
                            }
                            Spacer()
                            // Optionally, show number of questions or other details
                        }
                    }
                }
                .onDelete(perform: surveyListViewModel.deleteSurvey)
            }
            .navigationTitle("Surveys")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        self.surveyToEdit = nil // Ensure we are adding a new survey
                        self.showingAddSurveySheet = true
                    } label: {
                        Label("Add Survey", systemImage: "plus")
                    }
                }
            }
            .onAppear {
                surveyListViewModel.fetchSurveys()
            }
            // Sheet for Adding a new survey
            .sheet(isPresented: $showingAddSurveySheet) {
                // When this sheet is dismissed, refresh the survey list
                surveyListViewModel.fetchSurveys()
            } content: {
                SurveyEditView(moc: moc) // Pass moc, surveyToEdit will be nil for new survey
            }
            // Sheet for Editing an existing survey
            // This sheet is triggered when surveyToEdit is not nil
            .sheet(item: $surveyToEdit) { survey in
                 // When this sheet is dismissed, refresh the survey list
                surveyListViewModel.fetchSurveys()
            } content: { survey in
                SurveyEditView(surveyToEdit: survey, moc: moc)
            }
        }
    }
}

struct SurveyListView_Previews: PreviewProvider {
    static var previews: some View {
        // Use the preview context from PersistenceController
        SurveyListView()
            .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}
