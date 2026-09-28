Pod::Spec.new do |s|
  s.name = 'PolarysBluetooth'
  s.version = '1.0.0'
  s.summary = 'Polarys car audio route detection'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Polarys'
  s.homepage = 'https://expo.dev'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
