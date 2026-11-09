#!/usr/bin/env ruby
# frozen_string_literal: true

# Injects a throwaway XCUITest target into ios/App/App.xcodeproj so App Store screenshots can be
# captured from the real app in an iOS Simulator.
#
# This is deliberately a CI-only mutation. The committed project file is release-validated
# (scripts/prepare-ios-release.mjs -> validateIOSSourceConfiguration, config/release-validation.json),
# so the repository keeps exactly one app target and no test target. The workflow runs this script
# on the GitHub runner after the release-readiness sequence has already validated and synced the
# project, and never commits the result.
#
# Usage: ruby scripts/ios-screenshot-project.rb [path/to/App.xcodeproj]

require 'xcodeproj'

PROJECT_PATH = ARGV[0] || File.expand_path('../ios/App/App.xcodeproj', __dir__)
APP_TARGET_NAME = 'App'
TEST_TARGET_NAME = 'StoreScreenshotUITests'
SCHEME_NAME = 'StoreScreenshots'
# Relative to the directory that contains App.xcodeproj (ios/App).
TEST_SOURCE_GROUP_PATH = '../ScreenshotUITests'
TEST_SOURCE_FILE = 'StoreScreenshotTests.swift'

abort "Xcode project not found: #{PROJECT_PATH}" unless Dir.exist?(PROJECT_PATH)

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |target| target.name == APP_TARGET_NAME }
abort "Target #{APP_TARGET_NAME} not found in #{PROJECT_PATH}" if app_target.nil?

if project.targets.any? { |target| target.name == TEST_TARGET_NAME }
  puts "#{TEST_TARGET_NAME} already present; nothing to do."
  exit 0
end

deployment_target = app_target.build_configurations
                              .map { |config| config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] }
                              .compact
                              .first || '15.0'

test_target = project.new_target(:ui_test_bundle, TEST_TARGET_NAME, :ios, deployment_target)
test_target.add_dependency(app_target)

group = project.new_group(TEST_TARGET_NAME, TEST_SOURCE_GROUP_PATH)
source_reference = group.new_reference(TEST_SOURCE_FILE)
absolute_source = File.expand_path(File.join(TEST_SOURCE_GROUP_PATH, TEST_SOURCE_FILE), File.dirname(PROJECT_PATH))
abort "Test source not found: #{absolute_source}" unless File.file?(absolute_source)
test_target.add_file_references([source_reference])

test_target.build_configurations.each do |config|
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.bhaavamrit.app.storescreenshots',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'TEST_TARGET_NAME' => APP_TARGET_NAME,
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1',
    'IPHONEOS_DEPLOYMENT_TARGET' => deployment_target,
    'CODE_SIGNING_ALLOWED' => 'NO',
    'CODE_SIGNING_REQUIRED' => 'NO',
    'CODE_SIGN_IDENTITY' => '',
    'CODE_SIGN_STYLE' => 'Manual',
    'SUPPORTS_MACCATALYST' => 'NO',
    'ENABLE_USER_SCRIPT_SANDBOXING' => 'NO'
  )
end

# Xcode records the host application for a UI test bundle here as well as in TEST_TARGET_NAME.
attributes = project.root_object.attributes['TargetAttributes'] ||= {}
attributes[test_target.uuid] = { 'TestTargetID' => app_target.uuid }

project.save

# The repository ships no shared schemes (xcodebuild autocreates an "App" scheme). Write an
# explicit shared scheme so `xcodebuild test -scheme StoreScreenshots` is deterministic.
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app_target, true)
scheme.add_build_target(test_target, false)
scheme.add_test_target(test_target)
scheme.set_launch_target(app_target)
scheme.save_as(PROJECT_PATH, SCHEME_NAME, true)

puts "Added #{TEST_TARGET_NAME} (host #{APP_TARGET_NAME}, deployment #{deployment_target}) and shared scheme #{SCHEME_NAME}."
