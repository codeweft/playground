import SwiftUI
import CoreData

struct QuestionListView: View {
    @ObservedObject var survey: Survey // Ensure Survey is an ObservableObject or its relevant properties are @Published
    @Environment(\.managedObjectContext) private var moc
    
    @State private var showingQuestionEditSheet = false
    @State private var questionToEdit: Question? = nil
    @State private var isEditingSurveyDetails = false // To show SurveyEditView

    // Computed property to get sorted questions
    private var questions: [Question] {
        let questionSet = survey.questions as? Set<Question> ?? []
        // Sort by 'order', ensure 'order' attribute exists on Question entity
        return questionSet.sorted {
            $0.order < $1.order
        }
    }
    
    // Determine the next order value for a new question
    private var nextOrder: Int16 {
        (questions.last?.order ?? -1) + 1
    }

    var body: some View {
        VStack {
            // Optional: Button to edit Survey details if this view is also for that
            // Or this could be a separate navigation item
            Button("Edit Survey Details") {
                isEditingSurveyDetails = true
            }
            .padding()
            .sheet(isPresented: $isEditingSurveyDetails) {
                SurveyEditView(surveyToEdit: survey, moc: moc)
            }
            
            List {
                ForEach(questions) { question in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(question.text ?? "Untitled Question")
                                .font(.headline)
                            Text("Type: \(question.questionType ?? "N/A") | Order: \(question.order)")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                    }
                    .contentShape(Rectangle()) // Makes the whole row tappable
                    .onTapGesture {
                        self.questionToEdit = question
                        self.showingQuestionEditSheet = true // Trigger sheet for editing
                    }
                }
                .onDelete(perform: deleteQuestion)
            }
            .navigationTitle("Questions for \(survey.title ?? "Survey")")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        self.questionToEdit = nil // Ensure we are adding a new question
                        self.showingQuestionEditSheet = true
                    } label: {
                        Label("Add Question", systemImage: "plus")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton() // For list reordering/deleting if enabled
                }
            }
            // Sheet for Adding or Editing a question
            // Using a single sheet and changing its content based on questionToEdit
            .sheet(isPresented: $showingQuestionEditSheet, onDismiss: {
                // Optional: refresh data if needed, though @ObservedObject should handle it
                // survey.objectWillChange.send() // if survey's questions set doesn't auto-update view
            }) {
                // Pass the survey, the question to edit (or nil for new), and the moc
                QuestionEditView(
                    moc: moc,
                    survey: survey,
                    question: questionToEdit,
                    order: questionToEdit?.order ?? nextOrder // Use existing order or next available
                )
            }
        }
        // .onAppear {
            // If Survey is not an @ObservedObject or its questions are not updating,
            // you might need to manually refresh or ensure Survey's context has been saved
            // and it re-fetches or its properties are correctly published.
        // }
    }

    private func deleteQuestion(at offsets: IndexSet) {
        offsets.map { questions[$0] }.forEach { questionToDelete in
            // Remove from the survey's relationship
            if let mutableQuestions = survey.questions as? NSMutableSet {
                mutableQuestions.remove(questionToDelete)
            }
            // Delete from context
            moc.delete(questionToDelete)
        }

        do {
            try moc.save()
            // The @ObservedObject 'survey' should update the view.
            // If not, you might need to trigger an update manually or re-fetch.
            // For example, by calling survey.objectWillChange.send() if survey is an ObservableObject
            // and its questions property is @Published.
        } catch {
            print("Error deleting question: \(error.localizedDescription)")
            // Handle error
        }
    }
}

// MARK: - Preview
// To make previews work for QuestionListView, you need a sample Survey object.
// Ensure your Survey entity and its relationship to Question are set up.

struct QuestionListView_Previews: PreviewProvider {
    static var previews: some View {
        // Create an in-memory Core Data stack for previewing.
        let moc = PersistenceController.preview.container.viewContext

        // Create a sample survey.
        let sampleSurvey = Survey(context: moc)
        sampleSurvey.id = UUID()
        sampleSurvey.title = "Sample Preview Survey"
        sampleSurvey.surveyDescription = "This is a survey for preview purposes."
        sampleSurvey.createdAt = Date()

        // Create a few sample questions for the survey.
        let question1 = Question(context: moc)
        question1.id = UUID()
        question1.text = "What is your favorite color?"
        question1.questionType = QuestionType.openEnded.rawValue
        question1.order = 0
        question1.survey = sampleSurvey // Set relationship

        let question2 = Question(context: moc)
        question2.id = UUID()
        question2.text = "Which of these is a fruit?"
        question2.questionType = QuestionType.multipleChoice.rawValue
        question2.options = "Apple,Carrot,Broccoli"
        question2.order = 1
        question2.survey = sampleSurvey // Set relationship
        
        // You might need to explicitly add questions to the survey's question set
        // depending on how your Core Data classes are generated (e.g., if `addToQuestions` methods exist)
        // sampleSurvey.addToQuestions(question1)
        // sampleSurvey.addToQuestions(question2)
        // Or if you manage the Set directly:
        if let mutableQuestions = sampleSurvey.questions as? NSMutableSet {
             mutableQuestions.add(question1)
             mutableQuestions.add(question2)
        } else {
            // Fallback if not an NSSet or casting fails, though with CoreData generated classes it should be.
            // This might mean your questions relationship is not correctly defined as NSSet in the model.
            // For preview, you could manually create a set for `questions` if needed.
            // print("Warning: sampleSurvey.questions is not an NSMutableSet. Preview questions might not appear correctly.")
        }


        // Save the context to ensure relationships are set if your saving logic relies on it.
        do {
            try moc.save()
        } catch {
            print("Error saving preview context: \(error)")
        }
        
        // Make sure the survey object is observed if its properties change during preview.
        // If Survey itself is not an ObservableObject, wrap it or use a ViewModel.
        // For this preview, we pass it directly.
        
        return NavigationView { // Wrap in NavigationView for toolbar and title
            QuestionListView(survey: sampleSurvey)
                .environment(\.managedObjectContext, moc)
        }
    }
}
