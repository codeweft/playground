import SwiftUI

struct ResponseDetailView: View {
    let responseSet: DisplayableSurveyResponse

    var body: some View {
        List {
            Section(header: Text("Interview Details")) {
                HStack {
                    Text("Participant:")
                        .font(.headline)
                    Spacer()
                    Text(responseSet.participantName)
                        .font(.body)
                }
                HStack {
                    Text("Interview Date:")
                        .font(.headline)
                    Spacer()
                    Text(responseSet.interviewDate, formatter: itemFormatter)
                        .font(.body)
                }
            }

            Section(header: Text("Responses (\(responseSet.responses.count))")) {
                if responseSet.responses.isEmpty {
                    Text("No individual responses recorded for this session.")
                        .foregroundColor(.gray)
                } else {
                    ForEach(responseSet.responses) { response in
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Question: \(response.questionText)")
                                .font(.headline)
                            Text("Answer: \(response.responseText)")
                                .font(.body)
                                // Allow text to wrap and be scrollable if very long
                                .fixedSize(horizontal: false, vertical: true) 
                            Text("Type: \(response.questionType)")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        .padding(.vertical, 5) // Add some padding between responses
                    }
                }
            }
        }
        .navigationTitle("Response Details")
        .listStyle(InsetGroupedListStyle()) // Using InsetGroupedListStyle for better section separation
    }
}

private let itemFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateStyle = .long
    formatter.timeStyle = .medium
    return formatter
}()

struct ResponseDetailView_Previews: PreviewProvider {
    static var previews: some View {
        // Create sample data for DisplayableSurveyResponse
        let sampleIndividualResponses = [
            DisplayableIndividualResponse(id: UUID(), questionText: "What is your favorite aspect of our service?", responseText: "The customer support is excellent and very responsive.", questionType: "Open Ended"),
            DisplayableIndividualResponse(id: UUID(), questionText: "How likely are you to recommend us to a friend?", responseText: "Very Likely", questionType: "Single Choice"),
            DisplayableIndividualResponse(id: UUID(), questionText: "Which features do you use most often? (Select all that apply)", responseText: "Dashboard, Reporting", questionType: "Multiple Choice")
        ]

        // Create a dummy SurveyResponse object for the preview.
        // In a real scenario, this would come from Core Data.
        // For the preview, we only need it to satisfy the DisplayableSurveyResponse initializer.
        let dummySurveyResponse = SurveyResponse(context: PersistenceController.preview.container.viewContext) // Using preview context
        dummySurveyResponse.id = UUID() // Assign a UUID

        let sampleResponseSet = DisplayableSurveyResponse(
            id: UUID(),
            participantName: "Alex Johnson (Preview)",
            interviewDate: Date().addingTimeInterval(-86400), // Yesterday
            responses: sampleIndividualResponses,
            originalResponseObject: dummySurveyResponse // Pass the dummy object
        )

        NavigationView { // NavigationView for title display
            ResponseDetailView(responseSet: sampleResponseSet)
        }
    }
}
