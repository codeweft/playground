import Foundation // For DateFormatter if used, though not strictly necessary for basic version

enum LogLevel: String {
    case error = "ERROR"
    case critical = "CRITICAL"
    case warning = "WARNING"
    case info = "INFO"
    case debug = "DEBUG"
}

struct AppLogger { // Renamed to AppLogger to avoid potential conflicts with other Logger types
    private static func log(level: LogLevel, message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        let fileName = (file as NSString).lastPathComponent
        // Simple format: LEVEL: [FileName:Line] FunctionName - Message
        print("\(level.rawValue): [\(fileName):\(line)] \(function) - \(message)")
    }

    static func error(_ message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        log(level: .error, message: message, file: file, function: function, line: line)
    }

    static func critical(_ message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        log(level: .critical, message: message, file: file, function: function, line: line)
    }
    
    static func warning(_ message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        log(level: .warning, message: message, file: file, function: function, line: line)
    }

    static func info(_ message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        log(level: .info, message: message, file: file, function: function, line: line)
    }

    static func debug(_ message: String, file: String = #file, function: String = #function, line: UInt = #line) {
        log(level: .debug, message: message, file: file, function: function, line: line)
    }
}
