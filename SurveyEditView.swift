import SwiftUI
import CoreData

struct SurveyEditView: View {
    @StateObject private var surveyViewModel: SurveyViewModel
    @Environment(\.managedObjectContext) private var moc // Already available if passed to VM
    @Environment(\.dismiss) private var dismiss

    // This surveyToEdit is used to decide if we are editing or creating
    // The actual data binding is through the surveyViewModel
    private var surveyToEdit: Survey?

    init(surveyToEdit: Survey? = nil, moc: NSManagedObjectContext) {
        self.surveyToEdit = surveyToEdit
        // Initialize the StateObject with the moc and the optional survey
        _surveyViewModel = StateObject(wrappedValue: SurveyViewModel(moc: moc, survey: surveyToEdit))
    }

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Survey Details")) {
                    TextField("Title", text: $surveyViewModel.title)
                    // Using TextEditor for potentially multi-line description
                    ZStack(alignment: .topLeading) {
                        if surveyViewModel.surveyDescription.isEmpty {
                            Text("Description (Optional)")
                                .foregroundColor(Color(UIColor.placeholderText))
                                .padding(.top, 8) // Approximate padding for TextEditor
                                .padding(.leading, 5) // Approximate padding for TextEditor
                        }
                        TextEditor(text: $surveyViewModel.surveyDescription)
                            .frame(minHeight: 100) // Give some space for description
                    }
                }
            }
            .navigationTitle(surveyToEdit == nil ? "Add Survey" : "Edit Survey")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        surveyViewModel.saveSurvey()
                        dismiss()
                    }
                    .disabled(surveyViewModel.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

struct SurveyEditView_Previews: PreviewProvider {
    static var previews: some View {
        // Preview for adding a new survey
        SurveyEditView(moc: PersistenceController.preview.container.viewContext)
            .previewDisplayName("Add Survey")

        // Preview for editing an existing survey
        // Need to create a sample survey object for this
        let previewMoc = PersistenceController.preview.container.viewContext
        let sampleSurvey = Survey(context: previewMoc)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Sample Survey Title"
        sampleSurvey.surveyDescription = "This is a sample description for the survey."
        sampleSurvey.createdAt = Date()
        
        return SurveyEditView(surveyToEdit: sampleSurvey, moc: previewMoc)
            .previewDisplayName("Edit Survey")
    }
}
