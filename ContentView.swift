import SwiftUI
import CoreData // Ensure CoreData is imported if SurveyListView/ParticipantListView need it explicitly passed

struct ContentView: View {
    @Environment(\.managedObjectContext) private var moc
    // If you decide SpeechService should be a global singleton or created earlier in the app lifecycle,
    // you might initialize it here or in your App struct and pass it down.
    // For now, we'll let StartInterviewSetupView create its own instance for each interview session.
    // @StateObject private var speechService = SpeechService() // Example if shared from ContentView

    var body: some View {
        // Use NavigationStack for iOS 16+ for more robust navigation features.
        // For broader compatibility (iOS < 16), you can use NavigationView.
        NavigationStack {
            List {
                Section("Management") {
                    NavigationLink {
                        // SurveyListView should be able to access the MOC via @Environment
                        // or you could explicitly pass it if its initializer is designed that way.
                        // Based on Turn 10/19, SurveyListView(moc: moc) is expected.
                        SurveyListView(moc: moc)
                    } label: {
                        Label("Manage Surveys", systemImage: "list.bullet.rectangle.portrait")
                    }

                    NavigationLink {
                        // ParticipantListView also accesses MOC via @Environment or explicit pass.
                        // Based on Turn 19, ParticipantListView(moc: moc) is expected.
                        ParticipantListView(moc: moc)
                    } label: {
                        Label("Manage Participants", systemImage: "person.3")
                    }
                }

                Section("Actions") {
                    NavigationLink {
                        // StartInterviewSetupView will need the MOC to fetch surveys/participants.
                        // SpeechService will be instantiated within StartInterviewSetupView for this example.
                        StartInterviewSetupView(moc: moc)
                    } label: {
                        Label("Start New Interview", systemImage: "mic.badge.plus")
                    }
                }
                
                // Optional Section for Viewing Results
                // This could lead to a view similar to StartInterviewSetupView but for selecting
                // a survey and participant to view their SurveySummaryView.
                // Section("Results") {
                //     NavigationLink {
                //         // Placeholder: Define a view like 'SelectSummaryView.swift'
                //         // SelectSummaryView(moc: moc)
                //         Text("Placeholder for Viewing Summaries")
                //     } label: {
                //         Label("View Survey Results", systemImage: "chart.bar.doc.horizontal")
                //     }
                // }
            }
            .navigationTitle("VoiceSurveyor")
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    }
}
