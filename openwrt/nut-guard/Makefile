include $(TOPDIR)/rules.mk

PKG_NAME:=nut-guard
PKG_VERSION:=0.2.0
PKG_RELEASE:=1

PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/ospfx/nut-guard.git
PKG_SOURCE_VERSION:=HEAD
PKG_MIRROR_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/nut-guard
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=NUT UPS Guard - rpcd/ubus backend
  DEPENDS:=+rpcd +lua +libuci-lua +luci-base +nixio
  URL:=https://github.com/ospfx/nut-guard
endef

define Package/nut-guard/description
  rpcd/ubus backend for NUT (Network UPS Tools) UPS monitoring.
  Provides a Lua rpcd exec-plugin that exposes the "nutguard" ubus object
  with methods: get_config, set_config, get_ups.
  Configuration is stored in UCI (/etc/config/nut-guard).
  No extra management port or background daemon is required.
endef

define Package/nut-guard/conffiles
/etc/config/nut-guard
endef

define Build/Compile
endef

define Package/nut-guard/install
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/usr/libexec/rpcd/nutguard $(1)/usr/libexec/rpcd/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/nut-guard.init $(1)/etc/init.d/nut-guard
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/nut-guard.conf $(1)/etc/config/nut-guard
endef

$(eval $(call BuildPackage,nut-guard))
