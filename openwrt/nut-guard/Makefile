include $(TOPDIR)/rules.mk

PKG_NAME:=nut-guard
PKG_VERSION:=0.1.0
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
  TITLE:=NUT UPS Guard - Background Monitor Daemon
  DEPENDS:=+node
  URL:=https://github.com/ospfx/nut-guard
endef

define Package/nut-guard/description
  Background UPS monitoring daemon for NUT (Network UPS Tools).
  Reads UCI configuration from /etc/config/nut-guard, connects to a
  NUT server via TCP, and writes real-time UPS status to
  /var/run/nut-guard/status.json.
  Managed by procd. No extra management port is opened.
endef

define Package/nut-guard/conffiles
/etc/config/nut-guard
endef

define Build/Compile
endef

define Package/nut-guard/install
	$(INSTALL_DIR) $(1)/usr/share/nut-guard
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/monitor.js $(1)/usr/share/nut-guard/
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/nut-guard.init $(1)/etc/init.d/nut-guard
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/nut-guard.conf $(1)/etc/config/nut-guard
endef

$(eval $(call BuildPackage,nut-guard))
