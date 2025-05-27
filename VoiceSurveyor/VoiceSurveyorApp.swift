//
//  VoiceSurveyorApp.swift
//  VoiceSurveyor
//
//  Created by prep on 28/5/2025.
//

import SwiftUI

@main
struct VoiceSurveyorApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
