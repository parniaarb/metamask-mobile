// Third party dependencies.
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { isEqual } from 'lodash';
import { useNavigation } from '@react-navigation/native';

// External dependencies.
import BottomSheet, {
  BottomSheetRef,
} from '../../../component-library/components/BottomSheets/BottomSheet';
import UntypedEngine from '../../../core/Engine';
import { isDefaultAccountName } from '../../../util/ENSUtils';
import Logger from '../../../util/Logger';
import { MetaMetricsEvents } from '../../../core/Analytics';
import { SelectedAccount } from '../../../components/UI/AccountSelectorList/AccountSelectorList.types';
import {
  ToastContext,
  ToastVariants,
} from '../../../component-library/components/Toast';
import { ToastOptions } from '../../../component-library/components/Toast/Toast.types';
import { useAccounts, Account } from '../../hooks/useAccounts';
import getAccountNameWithENS from '../../../util/accounts';
import { IconName } from '../../../component-library/components/Icons/Icon';
import { getActiveTabUrl } from '../../../util/transactions';
import { getUrlObj, prefixUrlWithProtocol } from '../../../util/browser';
import { strings } from '../../../../locales/i18n';
import { AvatarAccountType } from '../../../component-library/components/Avatars/Avatar/variants/AvatarAccount';
import {
  getAddressAccountType,
  safeToChecksumAddress,
} from '../../../util/address';
import { USER_INTENT } from '../../../constants/permissions';
import { selectAccountsLength } from '../../../selectors/accountTrackerController';
import {
  selectIdentities,
  selectSelectedAddress,
} from '../../../selectors/preferencesController';

// Internal dependencies.
import {
  AccountConnectProps,
  AccountConnectScreens,
} from './AccountConnect.types';
import AccountConnectSingle from './AccountConnectSingle';
import AccountConnectSingleSelector from './AccountConnectSingleSelector';
import AccountConnectMultiSelector from './AccountConnectMultiSelector';
import useFavicon from '../../hooks/useFavicon/useFavicon';
import URLParse from 'url-parse';
import SDKConnect from '../../../core/SDKConnect/SDKConnect';
import AppConstants from '../../../../app/core/AppConstants';
import { trackDappViewedEvent } from '../../../util/metrics';
import { useMetrics } from '../../../components/hooks/useMetrics';
import { RootState } from '../../../../app/reducers';

const AccountConnect = (props: AccountConnectProps) => {
  const Engine = UntypedEngine as any;
  const { hostInfo, permissionRequestId } = props.route.params;
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const { trackEvent } = useMetrics();
  const selectedWalletAddress = useSelector(selectSelectedAddress);
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([
    selectedWalletAddress,
  ]);
  const sheetRef = useRef<BottomSheetRef>(null);
  const [screen, setScreen] = useState<AccountConnectScreens>(
    AccountConnectScreens.SingleConnect,
  );
  const { accounts, ensByAccountAddress } = useAccounts({
    isLoading,
  });
  const previousIdentitiesListSize = useRef<number>();
  const identitiesMap = useSelector(selectIdentities);

  const [userIntent, setUserIntent] = useState(USER_INTENT.None);

  const { toastRef } = useContext(ToastContext);
  const accountAvatarType = useSelector((state: any) =>
    state.settings.useBlockieIcon
      ? AvatarAccountType.Blockies
      : AvatarAccountType.JazzIcon,
  );

  const { id: channelId, origin: metadataOrigin } = hostInfo.metadata as {
    id: string;
    origin: string;
  };

  const origin: string = useSelector(getActiveTabUrl, isEqual);
  const accountsLength = useSelector(selectAccountsLength);

  const [hostname, setHostname] = useState<string>(origin);
  const urlWithProtocol = prefixUrlWithProtocol(hostname);
  const sdkConnection = SDKConnect.getInstance().getConnection({ channelId });
  // Last wallet connect session metadata
  const wc2Metadata = useSelector((state: RootState) => state.sdk.wc2Metadata);

  const dappIconUrl = sdkConnection?.originatorInfo?.icon;

  const faviconSource = useFavicon(origin);

  const actualIcon = useMemo(
    () => (dappIconUrl ? { uri: dappIconUrl } : faviconSource),
    [dappIconUrl, faviconSource],
  );

  const secureIcon = useMemo(
    () =>
      (getUrlObj(hostname) as URLParse<string>).protocol === 'https:'
        ? IconName.Lock
        : IconName.LockSlash,
    [hostname],
  );

  const loadHostname = useCallback(async () => {
    if (sdkConnection) {
      const _hostname = (
        sdkConnection?.originatorInfo?.url ?? metadataOrigin
      ).replace(AppConstants.MM_SDK.SDK_REMOTE_ORIGIN, '');
      return _hostname;
    }

    return wc2Metadata?.url ?? channelId;
  }, [channelId, metadataOrigin, sdkConnection, wc2Metadata]);

  // Retrieve hostname info based on channelId
  useEffect(() => {
    loadHostname().then(setHostname);
  }, [hostname, setHostname, loadHostname]);

  // Refreshes selected addresses based on the addition and removal of accounts.
  useEffect(() => {
    const identitiesAddressList = Object.keys(identitiesMap);
    if (previousIdentitiesListSize.current !== identitiesAddressList.length) {
      // Clean up selected addresses that are no longer part of identities.
      const updatedSelectedAddresses = selectedAddresses.filter((address) =>
        identitiesAddressList.includes(address),
      );
      setSelectedAddresses(updatedSelectedAddresses);
      previousIdentitiesListSize.current = identitiesAddressList.length;
    }
  }, [identitiesMap, selectedAddresses]);

  const cancelPermissionRequest = useCallback(
    (requestId) => {
      Engine.context.PermissionController.rejectPermissionsRequest(requestId);
      if (channelId && accountsLength === 0) {
        // Remove Potential SDK connection
        SDKConnect.getInstance().removeChannel({
          channelId,
          sendTerminate: true,
        });
      }

      trackEvent(MetaMetricsEvents.CONNECT_REQUEST_CANCELLED, {
        number_of_accounts: accountsLength,
        source: 'permission system',
      });
    },
    [
      Engine.context.PermissionController,
      accountsLength,
      channelId,
      trackEvent,
    ],
  );

  const triggerDappViewedEvent = useCallback(
    (numberOfConnectedAccounts: number) =>
      // Track dapp viewed event
      trackDappViewedEvent({ hostname, numberOfConnectedAccounts }),
    [hostname],
  );

  const handleConnect = useCallback(async () => {
    const selectedAccounts: SelectedAccount[] = selectedAddresses.map(
      (address, index) => ({ address, lastUsed: Date.now() - index }),
    );
    const request = {
      ...hostInfo,
      metadata: {
        ...hostInfo.metadata,
        origin: metadataOrigin,
      },
      approvedAccounts: selectedAccounts,
    };

    const connectedAccountLength = selectedAccounts.length;
    const activeAddress = selectedAccounts[0].address;
    const activeAccountName = getAccountNameWithENS({
      accountAddress: activeAddress,
      accounts,
      ensByAccountAddress,
    });

    try {
      setIsLoading(true);
      await Engine.context.PermissionController.acceptPermissionsRequest(
        request,
      );

      triggerDappViewedEvent(connectedAccountLength);

      trackEvent(MetaMetricsEvents.CONNECT_REQUEST_COMPLETED, {
        number_of_accounts: accountsLength,
        number_of_accounts_connected: connectedAccountLength,
        account_type: getAddressAccountType(activeAddress),
        source: 'in-app browser',
      });
      let labelOptions: ToastOptions['labelOptions'] = [];
      if (connectedAccountLength > 1) {
        labelOptions = [
          { label: `${connectedAccountLength} `, isBold: true },
          {
            label: `${strings('toast.accounts_connected')}`,
          },
          { label: `\n${activeAccountName} `, isBold: true },
          { label: strings('toast.now_active') },
        ];
      } else {
        labelOptions = [
          { label: `${activeAccountName} `, isBold: true },
          { label: strings('toast.connected_and_active') },
        ];
      }
      toastRef?.current?.showToast({
        variant: ToastVariants.Account,
        labelOptions,
        accountAddress: activeAddress,
        accountAvatarType,
      });
    } catch (e: any) {
      Logger.error(e, 'Error while trying to connect to a dApp.');
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedAddresses,
    hostInfo,
    accounts,
    ensByAccountAddress,
    accountAvatarType,
    Engine.context.PermissionController,
    toastRef,
    accountsLength,
    metadataOrigin,
    triggerDappViewedEvent,
    trackEvent,
  ]);

  const handleCreateAccount = useCallback(
    async (isMultiSelect?: boolean) => {
      const { KeyringController } = Engine.context;
      try {
        setIsLoading(true);
        const { addedAccountAddress } = await KeyringController.addNewAccount();
        const checksummedAddress = safeToChecksumAddress(
          addedAccountAddress,
        ) as string;
        !isMultiSelect && setSelectedAddresses([checksummedAddress]);
        trackEvent(MetaMetricsEvents.ACCOUNTS_ADDED_NEW_ACCOUNT);
      } catch (e: any) {
        Logger.error(e, 'error while trying to add a new account');
      } finally {
        setIsLoading(false);
      }
    },
    [Engine.context, trackEvent],
  );

  const hideSheet = (callback?: () => void) =>
    sheetRef?.current?.onCloseBottomSheet?.(callback);

  /**
   * User intent is set on AccountConnectSingle,
   * AccountConnectSingleSelector & AccountConnectMultiSelector.
   *
   * We need to know where the user clicks to decide what
   * should happen to the Permission Request Promise.
   * We then trigger the corresponding side effects &
   * control the Bottom Sheet visibility.
   */
  useEffect(() => {
    if (userIntent === USER_INTENT.None) return;

    const handleUserActions = (action: USER_INTENT) => {
      switch (action) {
        case USER_INTENT.Confirm: {
          handleConnect();
          hideSheet();
          break;
        }
        case USER_INTENT.Create: {
          handleCreateAccount();
          break;
        }
        case USER_INTENT.CreateMultiple: {
          handleCreateAccount(true);
          break;
        }
        case USER_INTENT.Cancel: {
          hideSheet(() => cancelPermissionRequest(permissionRequestId));
          break;
        }
        case USER_INTENT.Import: {
          navigation.navigate('ImportPrivateKeyView');
          // TODO: Confirm if this is where we want to track importing an account or within ImportPrivateKeyView screen.
          trackEvent(MetaMetricsEvents.ACCOUNTS_IMPORTED_NEW_ACCOUNT);
          break;
        }
        case USER_INTENT.ConnectHW: {
          navigation.navigate('ConnectQRHardwareFlow');
          // TODO: Confirm if this is where we want to track connecting a hardware wallet or within ConnectQRHardwareFlow screen.
          trackEvent(MetaMetricsEvents.CONNECT_HARDWARE_WALLET);

          break;
        }
      }
    };

    handleUserActions(userIntent);

    setUserIntent(USER_INTENT.None);
  }, [
    navigation,
    userIntent,
    sheetRef,
    cancelPermissionRequest,
    permissionRequestId,
    handleCreateAccount,
    handleConnect,
    trackEvent,
  ]);

  const handleSheetDismiss = () => {
    if (!permissionRequestId || userIntent !== USER_INTENT.None) return;

    cancelPermissionRequest(permissionRequestId);
  };

  const renderSingleConnectScreen = useCallback(() => {
    const selectedAddress = selectedAddresses[0];
    const selectedAccount = accounts.find(
      (account) =>
        safeToChecksumAddress(account.address) ===
        safeToChecksumAddress(selectedAddress),
    );
    const ensName = ensByAccountAddress[selectedAddress];
    const defaultSelectedAccount: Account | undefined = selectedAccount
      ? {
          ...selectedAccount,
          name:
            isDefaultAccountName(selectedAccount.name) && ensName
              ? ensName
              : selectedAccount.name,
        }
      : undefined;
    return (
      <AccountConnectSingle
        onSetSelectedAddresses={setSelectedAddresses}
        connection={sdkConnection}
        onSetScreen={setScreen}
        onUserAction={setUserIntent}
        defaultSelectedAccount={defaultSelectedAccount}
        isLoading={isLoading}
        favicon={actualIcon}
        secureIcon={secureIcon}
        urlWithProtocol={urlWithProtocol}
      />
    );
  }, [
    accounts,
    ensByAccountAddress,
    selectedAddresses,
    isLoading,
    setScreen,
    setSelectedAddresses,
    actualIcon,
    secureIcon,
    sdkConnection,
    urlWithProtocol,
    setUserIntent,
  ]);

  const renderSingleConnectSelectorScreen = useCallback(
    () => (
      <AccountConnectSingleSelector
        accounts={accounts}
        ensByAccountAddress={ensByAccountAddress}
        onSetScreen={setScreen}
        onSetSelectedAddresses={setSelectedAddresses}
        selectedAddresses={selectedAddresses}
        isLoading={isLoading}
        onUserAction={setUserIntent}
      />
    ),
    [
      accounts,
      ensByAccountAddress,
      selectedAddresses,
      isLoading,
      setUserIntent,
      setSelectedAddresses,
      setScreen,
    ],
  );

  const renderMultiConnectSelectorScreen = useCallback(
    () => (
      <AccountConnectMultiSelector
        accounts={accounts}
        ensByAccountAddress={ensByAccountAddress}
        selectedAddresses={selectedAddresses}
        onSelectAddress={setSelectedAddresses}
        isLoading={isLoading}
        favicon={faviconSource}
        secureIcon={secureIcon}
        urlWithProtocol={urlWithProtocol}
        onUserAction={setUserIntent}
        onBack={() => setScreen(AccountConnectScreens.SingleConnect)}
        connection={sdkConnection}
      />
    ),
    [
      accounts,
      ensByAccountAddress,
      selectedAddresses,
      setSelectedAddresses,
      isLoading,
      setUserIntent,
      faviconSource,
      urlWithProtocol,
      secureIcon,
      sdkConnection,
    ],
  );

  const renderConnectScreens = useCallback(() => {
    switch (screen) {
      case AccountConnectScreens.SingleConnect:
        return renderSingleConnectScreen();
      case AccountConnectScreens.SingleConnectSelector:
        return renderSingleConnectSelectorScreen();
      case AccountConnectScreens.MultiConnectSelector:
        return renderMultiConnectSelectorScreen();
    }
  }, [
    screen,
    renderSingleConnectScreen,
    renderSingleConnectSelectorScreen,
    renderMultiConnectSelectorScreen,
  ]);

  return (
    <BottomSheet onClose={handleSheetDismiss} ref={sheetRef}>
      {renderConnectScreens()}
    </BottomSheet>
  );
};

export default AccountConnect;
