import React from 'react';
import Device from '../../../../../util/device';
import Text, {
  TextVariant,
  TextColor,
} from '../../../../../component-library/components/Texts/Text';
import { useTheme } from '../../../../../util/theme';
import { strings } from '../../../../../../locales/i18n';
import { Switch, View } from 'react-native';
import { useSelector } from 'react-redux';
import { selectIsSecurityAlertsEnabled } from '../../../../../selectors/preferencesController';
import Engine from '../../../../../core/Engine';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import { useNavigation } from '@react-navigation/native';
import Routes from '../../../../../constants/navigation/Routes';
import SECURITY_ALERTS_TOGGLE_TEST_ID from '../constants';
import createStyles from './BlockaidSettings.styles';
import { useMetrics } from '../../../../../components/hooks/useMetrics';

const BlockaidSettings = () => {
  const theme = useTheme();
  const { colors } = useTheme();
  const { trackEvent } = useMetrics();
  const styles = createStyles();
  const securityAlertsEnabled = useSelector(selectIsSecurityAlertsEnabled);
  const navigation = useNavigation();

  const toggleSecurityAlertsEnabled = () => {
    const { PreferencesController } = Engine.context;

    if (securityAlertsEnabled) {
      PreferencesController?.setSecurityAlertsEnabled(false);
      trackEvent(MetaMetricsEvents.SETTINGS_SECURITY_ALERTS_ENABLED, {
        security_alerts_enabled: false,
      });
    } else if (Device.isIos()) {
      PreferencesController?.setSecurityAlertsEnabled(true);
    } else {
      navigation.navigate(Routes.MODAL.ROOT_MODAL_FLOW, {
        screen: Routes.SHEET.BLOCKAID_INDICATOR,
      });
    }
  };

  return (
    <>
      {Device.isAndroid() && (
        <Text
          color={TextColor.Default}
          variant={TextVariant.HeadingLG}
          style={styles.heading}
        >
          {strings('app_settings.security_heading')}
        </Text>
      )}
      <View style={styles.setting}>
        <Text color={TextColor.Default} variant={TextVariant.BodyLGMedium}>
          {strings('app_settings.security_alerts')}
        </Text>
        <Text
          color={TextColor.Alternative}
          variant={TextVariant.BodyMD}
          style={styles.desc}
        >
          {strings('app_settings.security_alerts_desc')}
        </Text>
      </View>
      <View style={styles.switchElement}>
        <Text color={TextColor.Default} variant={TextVariant.BodyLGMedium}>
          {strings('app_settings.blockaid')}
        </Text>
        <Switch
          value={securityAlertsEnabled}
          onValueChange={toggleSecurityAlertsEnabled}
          trackColor={{
            true: colors.primary.default,
            false: colors.border.muted,
          }}
          thumbColor={theme.brandColors.white['000']}
          style={styles.switch}
          ios_backgroundColor={colors.border.muted}
          testID={SECURITY_ALERTS_TOGGLE_TEST_ID}
        />
      </View>

      <Text
        color={TextColor.Alternative}
        variant={TextVariant.BodyMD}
        style={styles.desc}
      >
        {strings('app_settings.blockaid_desc')}
      </Text>
    </>
  );
};

export default BlockaidSettings;
