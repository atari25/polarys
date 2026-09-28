import ExpoModulesCore
import AVFAudio

public class PolarysBluetoothModule: Module {
  private let savedKey = "polarys.carAudioRoute"

  private func route() -> AVAudioSessionPortDescription? {
    AVAudioSession.sharedInstance().currentRoute.outputs.first {
      [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .carAudio].contains($0.portType)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("PolarysBluetooth")

    Function("getStatus") { () -> [String: Any] in
      let current = self.route()
      let saved = UserDefaults.standard.string(forKey: self.savedKey)
      return [
        "deviceName": current?.portName ?? "",
        "connected": current != nil,
        "carConnected": current != nil && current?.uid == saved,
        "hasSavedCar": saved != nil
      ]
    }

    Function("saveCurrentCar") { () -> Bool in
      guard let current = self.route() else { return false }
      UserDefaults.standard.set(current.uid, forKey: self.savedKey)
      return true
    }

    Function("forgetCar") {
      UserDefaults.standard.removeObject(forKey: self.savedKey)
    }
  }
}
