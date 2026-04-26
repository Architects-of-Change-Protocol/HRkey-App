import logger from '../logger.js';
import {
  getWalletBalance,
  topupWalletMock,
  createPurchase,
  listPurchaseHistory,
  requestRefund,
  resolveRefund,
  getAccessDelivery,
  upsertFavoriteReferee,
  removeFavoriteReferee,
  listFavoriteReferees,
  repeatBuy,
  getMarketplaceAnalytics
} from '../services/hrkeyTransactionEngine.service.js';

function handleControllerError(res, req, error, defaultCode) {
  logger.warn(defaultCode, {
    requestId: req.requestId,
    userId: req.user?.id,
    error: error.message
  });

  return res.status(error.status || 500).json({
    ok: false,
    error: defaultCode,
    message: error.message
  });
}

export async function getMyWallet(req, res) {
  try {
    const wallet = await getWalletBalance(req.user.id);
    return res.status(200).json({ ok: true, wallet });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_WALLET_FAILED');
  }
}

export async function postMockTopup(req, res) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'FORBIDDEN', message: 'Mock topup is disabled in production' });
    }

    const { amount } = req.body || {};
    const wallet = await topupWalletMock({ userId: req.user.id, amount });

    return res.status(200).json({ ok: true, wallet });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_TOPUP_FAILED');
  }
}

export async function postPurchase(req, res) {
  try {
    const { companyId, refereeUserId, amount, productCode, refereeShareRatio, referencePackageUrl } = req.body || {};

    const result = await createPurchase({
      buyerUserId: req.user.id,
      companyId,
      refereeUserId,
      amount,
      productCode,
      refereeShareRatio,
      referencePackageUrl
    });

    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_PURCHASE_FAILED');
  }
}

export async function getMyPurchases(req, res) {
  try {
    const purchases = await listPurchaseHistory({
      userId: req.user.id,
      companyId: req.query.companyId || null,
      limit: req.query.limit || 50
    });

    return res.status(200).json({ ok: true, purchases });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_PURCHASE_HISTORY_FAILED');
  }
}

export async function getPurchaseAccess(req, res) {
  try {
    const access = await getAccessDelivery(req.params.purchaseId, req.user.id);
    return res.status(200).json({ ok: true, access });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_ACCESS_DELIVERY_FAILED');
  }
}

export async function postRefundRequest(req, res) {
  try {
    const refund = await requestRefund({
      purchaseId: req.params.purchaseId,
      requesterUserId: req.user.id,
      reason: req.body?.reason
    });

    return res.status(201).json({ ok: true, refund });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_REFUND_REQUEST_FAILED');
  }
}

export async function postRefundResolution(req, res) {
  try {
    const refund = await resolveRefund({
      refundId: req.params.refundId,
      resolution: req.body?.resolution,
      resolverUserId: req.user.id
    });

    return res.status(200).json({ ok: true, refund });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_REFUND_RESOLUTION_FAILED');
  }
}

export async function getReferencePackageDownload(req, res) {
  try {
    const access = await getAccessDelivery(req.params.purchaseId, req.user.id);

    return res.status(200).json({
      ok: true,
      download: {
        purchaseId: req.params.purchaseId,
        unlockStatus: access.unlock_status,
        referencePackageUrl: access.reference_package_url,
        unlockedAt: access.unlocked_at
      }
    });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_DOWNLOAD_FAILED');
  }
}

export async function postFavoriteReferee(req, res) {
  try {
    const favorite = await upsertFavoriteReferee({
      companyId: req.body?.companyId,
      refereeUserId: req.params.refereeUserId,
      createdByUserId: req.user.id
    });

    return res.status(201).json({ ok: true, favorite });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_FAVORITE_FAILED');
  }
}

export async function deleteFavoriteReferee(req, res) {
  try {
    const result = await removeFavoriteReferee({
      companyId: req.query.companyId,
      refereeUserId: req.params.refereeUserId
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_FAVORITE_REMOVE_FAILED');
  }
}

export async function getFavoriteReferees(req, res) {
  try {
    const favorites = await listFavoriteReferees(req.query.companyId);
    return res.status(200).json({ ok: true, favorites });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_FAVORITES_LIST_FAILED');
  }
}

export async function postRepeatBuy(req, res) {
  try {
    const result = await repeatBuy({
      purchaseId: req.params.purchaseId,
      buyerUserId: req.user.id
    });

    return res.status(201).json({ ok: true, ...result });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_REPEAT_BUY_FAILED');
  }
}

export async function getMarketplaceDashboard(req, res) {
  try {
    const dashboard = await getMarketplaceAnalytics({
      companyId: req.query.companyId || null,
      days: req.query.days || 30
    });

    return res.status(200).json({ ok: true, dashboard });
  } catch (error) {
    return handleControllerError(res, req, error, 'HRKEY_ANALYTICS_FAILED');
  }
}

export default {
  getMyWallet,
  postMockTopup,
  postPurchase,
  getMyPurchases,
  getPurchaseAccess,
  postRefundRequest,
  postRefundResolution,
  getReferencePackageDownload,
  postFavoriteReferee,
  deleteFavoriteReferee,
  getFavoriteReferees,
  postRepeatBuy,
  getMarketplaceDashboard
};
