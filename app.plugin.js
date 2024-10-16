const {
  AndroidConfig,
  withAppBuildGradle,
  withSettingsGradle,
  withAndroidManifest,
  withAppDelegate,
} = require('@expo/config-plugins');

let JPUSH_APPKEY = 'appKey',
  JPUSH_CHANNEL = 'channel';

const withJPush = (config, props) => {
  if (!props || !props.appKey || !props.channel)
    throw new Error('[MX_JPush_Expo] 请传入参数 appKey & channel');
  JPUSH_APPKEY = props.appKey;
  JPUSH_CHANNEL = props.channel;
  config = setAppDelegate(config);
  config = setAndroidManifest(config);
  config = setAppBuildGradle(config);
  config = setSettingsGradle(config);
  return config;
};
const setInterface = (config) => {
  withAppDelegate(config, (config) => {
    const implementationIndex = config.modResults.contents.indexOf('@implementation AppDelegate');

    if (implementationIndex !== -1) {
      console.log('\n[MX_JPush_Expo] 配置 AppDelegate interface ... ');
      const injectionCode = `
        @interface AppDelegate () <JPUSHRegisterDelegate>
        @end
      `;
      // 在 @implementation AppDelegate 前插入代码
      const updatedData = config.modResults.contents.slice(0, implementationIndex) + injectionCode + config.modResults.contents.slice(implementationIndex);
      config.modResults.contents = updatedData;
    } else {
      console.log('未找到 @implementation AppDelegate');
    }
  });
};

// 配置 iOS AppDelegate
const setAppDelegate = (config) =>
  withAppDelegate(config, (config) => {
    if (
      config.modResults.contents.indexOf('#import <UserNotifications/UserNotifications.h>') === -1
    ) {
      console.log('\n[MX_JPush_Expo] 配置 AppDelegate import ... ');
      config.modResults.contents =
        `
        #import <UserNotifications/UserNotifications.h>
        #import <RCTJPushModule.h>
        #import <React/RCTBridge.h>
        #import <React/RCTRootView.h>
        ` + config.modResults.contents;
    }
    
    if (
      config.modResults.contents.indexOf(
        'JPUSHService setupWithOption:launchOptions'
      ) === -1
    ) {
      console.log(
        '\n[MX_JPush_Expo] 配置 AppDelegate didFinishLaunchingWithOptions ... '
      );
      const didFinishLaunchingWithOptionsResult =
        config.modResults.contents.match(
          /didFinishLaunchingWithOptions([\s\S]*)launchOptions\n\{\n/
        );
      const [didFinishLaunchingWithOptions] =
        didFinishLaunchingWithOptionsResult;
      const didFinishLaunchingWithOptionsIndex =
        didFinishLaunchingWithOptionsResult.index;
      const didFinishLaunchingWithOptionsStartIndex =
        didFinishLaunchingWithOptionsIndex +
        didFinishLaunchingWithOptions.length;
      config.modResults.contents =
        config.modResults.contents.slice(
          0,
          didFinishLaunchingWithOptionsStartIndex
        ) +
        `  // JPush初始化配置
  [JPUSHService setupWithOption:launchOptions appKey:@"${JPUSH_APPKEY}" channel:@"${JPUSH_CHANNEL}" apsForProduction:YES];
  // APNS 注册实体配置
  JPUSHRegisterEntity *entity = [[JPUSHRegisterEntity alloc] init];
  if (@available(iOS 12.0, *)) {
    entity.types = JPAuthorizationOptionAlert | JPAuthorizationOptionBadge | JPAuthorizationOptionSound;
  }
  [JPUSHService registerForRemoteNotificationConfig:entity delegate:self];
  
  // 监听远程通知和响应通知
  NSNotificationCenter *defaultCenter = [NSNotificationCenter defaultCenter];
  [defaultCenter addObserver:self selector:@selector(networkDidReceiveMessage:) name:kJPFNetworkDidReceiveMessageNotification object:nil];

` +
        config.modResults.contents.slice(
          didFinishLaunchingWithOptionsStartIndex
        );
    } else {
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 AppDelegate appKey & channel ... '
      );
      config.modResults.contents = config.modResults.contents.replace(
        /appKey\:\@\"(.*)\" channel\:\@\"(.*)\" /,
        `appKey:@"${JPUSH_APPKEY}" channel:@"${JPUSH_CHANNEL}" `
      );
    }
    if (
      config.modResults.contents.indexOf(
        'JPush start'
      ) === -1
    ) {
      console.log('\n[JPushExpoConfigPlugin] 配置 AppDelegate other ... ');
      config.modResults.contents = config.modResults.contents.replace(
        /\@end([\n]*)$/,
        `//************************************************JPush start************************************************

- (void)application:(UIApplication *)application didRegisterForRemoteNotificationsWithDeviceToken:(NSData *)deviceToken {
  [JPUSHService registerDeviceToken:deviceToken];
}

- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error {
  [super application:application didFailToRegisterForRemoteNotificationsWithError:error];
}

- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler {
  [JPUSHService handleRemoteNotification:userInfo];
  [[NSNotificationCenter defaultCenter] postNotificationName:J_APNS_NOTIFICATION_ARRIVED_EVENT object:userInfo];
  completionHandler(UIBackgroundFetchResultNewData);
}

// iOS 10 及以上版本的通知处理
- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(NSInteger))completionHandler {
  completionHandler(UNNotificationPresentationOptionAlert);
}

- (void)jpushNotificationCenter:(UNUserNotificationCenter *)center didReceiveNotificationResponse:(UNNotificationResponse *)response withCompletionHandler:(void (^)(void))completionHandler {
  completionHandler();
}

// 自定义消息
- (void)networkDidReceiveMessage:(NSNotification *)notification {
  [[NSNotificationCenter defaultCenter] postNotificationName:J_CUSTOM_NOTIFICATION_EVENT object:[notification userInfo]];
}

//************************************************JPush end************************************************

@end
`
      );
    }

    return config;
  });

// 配置 Android AndroidManifest
const setAndroidManifest = (config) =>
  withAndroidManifest(config, (config) => {
    if (
      AndroidConfig.Manifest.findMetaDataItem(
        config.modResults.manifest.application[0],
        'JPUSH_CHANNEL'
      ) === -1
    ) {
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 AndroidManifest JPUSH_CHANNEL ... '
      );
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        config.modResults.manifest.application[0],
        'JPUSH_CHANNEL',
        '${JPUSH_CHANNEL}'
      );
    }
    if (
      AndroidConfig.Manifest.findMetaDataItem(
        config.modResults.manifest.application[0],
        'JPUSH_APPKEY'
      ) === -1
    ) {
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 AndroidManifest JPUSH_APPKEY ... '
      );
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        config.modResults.manifest.application[0],
        'JPUSH_APPKEY',
        '${JPUSH_APPKEY}'
      );
    }
    if (
      config.modResults.manifest.application[0].activity.findIndex(
        (item) =>
          item.$['android:name'] === 'cn.jpush.android.service.JNotifyActivity'
      ) === -1
    ) {
      console.log(
        '\n[JPushExpoConfigPlugin] 此后两项为BUG修复, 对应版本 jpush-react-native 2.8.3'
      );
      console.log(
        '\n[JPushExpoConfigPlugin] - 配置 AndroidManifest xmlns:tools ... '
      );
      config.modResults.manifest.$['xmlns:tools'] =
        'http://schemas.android.com/tools';
      console.log(
        '\n[JPushExpoConfigPlugin] - 配置 AndroidManifest activity ... '
      );
      config.modResults.manifest.application[0].activity.push({
        $: {
          'android:name': 'cn.jpush.android.service.JNotifyActivity',
          'android:exported': 'true',
          'tools:node': 'replace',
          'android:taskAffinity': 'jpush.custom',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'cn.jpush.android.intent.JNotifyActivity',
                },
              },
            ],
            category: [
              {
                $: {
                  'android:name': 'android.intent.category.DEFAULT',
                },
              },
              {
                $: {
                  'android:name': '${applicationId}',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });

// 配置 Android build.gradle
const setAppBuildGradle = (config) =>
  withAppBuildGradle(config, (config) => {
    const defaultConfig = config.modResults.contents.match(
      /defaultConfig([\s\S]*)versionName(.*)\n/
    );
    if (defaultConfig) {
      const [startString] = defaultConfig;
      const startStringLength = startString.length;
      const startStringIndex =
        config.modResults.contents.indexOf(startString) + startStringLength;
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 build.gradle appKey & channel ... '
      );
      if (config.modResults.contents.indexOf('JPUSH_APPKEY') === -1) {
        config.modResults.contents =
          config.modResults.contents.slice(0, startStringIndex) +
          `        manifestPlaceholders = [
            JPUSH_APPKEY: "${JPUSH_APPKEY}",
            JPUSH_CHANNEL: "${JPUSH_CHANNEL}"
        ]\n` +
          config.modResults.contents.slice(startStringIndex);
      } else {
        config.modResults.contents = config.modResults.contents.replace(
          /manifestPlaceholders([\s\S]*)JPUSH_APPKEY([\s\S]*)JPUSH_CHANNEL(.*)"\n(.*)\]\n/,
          `manifestPlaceholders = [
            JPUSH_APPKEY: "${JPUSH_APPKEY}",
            JPUSH_CHANNEL: "${JPUSH_CHANNEL}"
        ]\n`
        );
      }
    } else
      throw new Error(
        '[JPushExpoConfigPlugin] 无法完成 build.gradle - defaultConfig 配置'
      );
    const dependencies = config.modResults.contents.match(/dependencies {\n/);
    if (dependencies) {
      const [startString] = dependencies;
      const startStringLength = startString.length;
      const startStringIndex =
        config.modResults.contents.indexOf(startString) + startStringLength;
      if (
        config.modResults.contents.indexOf(
          `implementation project(':jpush-react-native')`
        ) === -1
      ) {
        console.log(
          '\n[JPushExpoConfigPlugin] 配置 build.gradle dependencies jpush-react-native ... '
        );
        config.modResults.contents =
          config.modResults.contents.slice(0, startStringIndex) +
          `    implementation project(':jpush-react-native')\n` +
          config.modResults.contents.slice(startStringIndex);
      }
      if (
        config.modResults.contents.indexOf(
          `implementation project(':jcore-react-native')`
        ) === -1
      ) {
        console.log(
          '\n[JPushExpoConfigPlugin] 配置 build.gradle dependencies jcore-react-native ... '
        );
        config.modResults.contents =
          config.modResults.contents.slice(0, startStringIndex) +
          `    implementation project(':jcore-react-native')\n` +
          config.modResults.contents.slice(startStringIndex);
      }
    } else
      throw new Error(
        '[JPushExpoConfigPlugin] 无法完成 build.gradle dependencies 配置'
      );

    return config;
  });

// 配置 Android settings.gradle
const setSettingsGradle = (config) =>
  withSettingsGradle(config, (config) => {
    if (
      config.modResults.contents.indexOf(`include ':jpush-react-native'`) === -1
    ) {
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 settings.gradle include jpush-react-native ... '
      );
      config.modResults.contents =
        config.modResults.contents +
        `
include ':jpush-react-native'
project(':jpush-react-native').projectDir = new File(rootProject.projectDir, '../node_modules/jpush-react-native/android')`;
    }
    if (
      config.modResults.contents.indexOf(`include ':jcore-react-native'`) === -1
    ) {
      console.log(
        '\n[JPushExpoConfigPlugin] 配置 settings.gradle include jcore-react-native ... '
      );
      config.modResults.contents =
        config.modResults.contents +
        `
include ':jcore-react-native'
project(':jcore-react-native').projectDir = new File(rootProject.projectDir, '../node_modules/jcore-react-native/android')`;
    }

    return config;
  });

module.exports = withJPush;
